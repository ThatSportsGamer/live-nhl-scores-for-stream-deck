/**
 * Live Hockey Scores — Stream Deck Plugin
 * Covers NHL, AHL, and ECHL.
 * Uses Node.js built-in modules only (net, https, crypto).
 * No npm packages required.
 */

'use strict';

const net    = require('net');
const https  = require('https');
const crypto = require('crypto');
const events = require('events');
const path   = require('path');
const fs     = require('fs');

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'plugin.log');
try { fs.writeFileSync(LOG_FILE, `=== Hockey Plugin ${new Date().toISOString()} ===\nNode: ${process.version}\nArgs: ${process.argv.slice(2).join(' ')}\n`); } catch (e) { /* ignore */ }

function log(...args) {
    const ts   = new Date().toISOString().slice(11, 19);
    const line = `[${ts}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
    try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore */ }
}

process.on('uncaughtException',  err => log('CRASH:', err.stack || err.message));
process.on('unhandledRejection', err => log('UNHANDLED:', String(err)));

// ── Parse Stream Deck launch arguments ────────────────────────────────────────
let sdPort, pluginUUID, registerEvent;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-port')          sdPort        = argv[i + 1];
    if (argv[i] === '-pluginUUID')    pluginUUID    = argv[i + 1];
    if (argv[i] === '-registerEvent') registerEvent = argv[i + 1];
}

log('port=' + sdPort + ' uuid=' + pluginUUID + ' event=' + registerEvent);

if (!sdPort || !pluginUUID || !registerEvent) {
    log('ERROR: Missing required args. Stream Deck may not have launched this plugin correctly.');
    process.exit(1);
}

// ── Minimal WebSocket client (no external deps) ───────────────────────────────
class SimpleWS extends events.EventEmitter {
    constructor(port, host) {
        super();
        this.readyState  = 0;
        this._buf        = Buffer.alloc(0);
        this._handshaked = false;

        this._sock = net.createConnection(parseInt(port, 10), host || '127.0.0.1');

        this._sock.on('connect', () => {
            log('TCP connected, sending WS upgrade...');
            const key = crypto.randomBytes(16).toString('base64');
            this._sock.write([
                'GET / HTTP/1.1',
                `Host: 127.0.0.1:${port}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Key: ${key}`,
                'Sec-WebSocket-Version: 13',
                '', '',
            ].join('\r\n'));
        });

        this._sock.on('data',  chunk => this._onData(chunk));
        this._sock.on('error', err   => { log('TCP error:', err.message); this.emit('error', err); });
        this._sock.on('close', ()    => { this.readyState = 3; log('TCP closed'); this.emit('close'); });
    }

    _onData(chunk) {
        this._buf = Buffer.concat([this._buf, chunk]);

        if (!this._handshaked) {
            let end = -1;
            for (let i = 0; i <= this._buf.length - 4; i++) {
                if (this._buf[i]===13 && this._buf[i+1]===10 &&
                    this._buf[i+2]===13 && this._buf[i+3]===10) { end = i + 4; break; }
            }
            if (end === -1) return;

            const header = this._buf.slice(0, end).toString('ascii');
            log('HTTP response:', header.split('\r\n')[0]);

            if (!header.includes('101')) {
                log('WS upgrade failed!');
                this.emit('error', new Error('WebSocket upgrade rejected'));
                return;
            }

            this._handshaked = true;
            this.readyState  = 1;
            this._buf        = this._buf.slice(end);
            log('WS handshake OK');
            this.emit('open');
        }

        this._parseFrames();
    }

    _parseFrames() {
        while (this._buf.length >= 2) {
            const b0       = this._buf[0];
            const b1       = this._buf[1];
            const opcode   = b0 & 0x0f;
            const isMasked = !!(b1 & 0x80);
            let   plen     = b1 & 0x7f;
            let   offset   = 2;

            if (plen === 126) {
                if (this._buf.length < 4) return;
                plen = this._buf.readUInt16BE(2); offset = 4;
            } else if (plen === 127) {
                if (this._buf.length < 10) return;
                plen = Number(this._buf.readBigUInt64BE(2)); offset = 10;
            }

            const maskLen = isMasked ? 4 : 0;
            const total   = offset + maskLen + plen;
            if (this._buf.length < total) return;

            let payload = Buffer.from(this._buf.slice(offset + maskLen, total));
            if (isMasked) {
                const mask = this._buf.slice(offset, offset + 4);
                for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
            }
            this._buf = this._buf.slice(total);

            if      (opcode === 0x1) this.emit('message', payload.toString('utf8'));
            else if (opcode === 0x8) { this.readyState = 3; log('WS close frame'); this.emit('close'); return; }
            else if (opcode === 0x9) this._sendFrame(0x8a, payload);
        }
    }

    send(str) {
        if (this.readyState !== 1) { log('WARN: send() called but WS not open (state=' + this.readyState + ')'); return; }
        this._sendFrame(0x81, Buffer.from(String(str), 'utf8'));
    }

    _sendFrame(opcode, payload) {
        const len  = payload.length;
        const mask = crypto.randomBytes(4);
        let   hdr;

        if (len < 126) {
            hdr = Buffer.alloc(6);
            hdr[0] = opcode; hdr[1] = 0x80 | len;
            mask.copy(hdr, 2);
        } else if (len < 65536) {
            hdr = Buffer.alloc(8);
            hdr[0] = opcode; hdr[1] = 0x80 | 126;
            hdr.writeUInt16BE(len, 2);
            mask.copy(hdr, 4);
        } else {
            log('WS: payload too large (' + len + ' bytes)'); return;
        }

        const masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
        this._sock.write(Buffer.concat([hdr, masked]));
    }
}

// ── Plugin state ──────────────────────────────────────────────────────────────
const instances     = new Map(); // context -> settings ({ league, teamId, teamAbbr, teamName })
const prevScores    = new Map(); // context -> { awayGoals, homeGoals }
const prevState     = new Map(); // context -> last known game state string
const flashing      = new Set();
const refreshing    = new Set();
const lastRender    = new Map();
const currentGame   = new Map();
const refreshTimers = new Map();

// ── Connect to Stream Deck ────────────────────────────────────────────────────
log('Connecting to Stream Deck on port', sdPort);
const ws = new SimpleWS(sdPort);

ws.on('open', () => {
    log('WS open — registering plugin');
    ws.send(JSON.stringify({ event: registerEvent, uuid: pluginUUID }));
});

ws.on('message', raw => {
    let ev;
    try { ev = JSON.parse(raw); } catch (e) { log('Bad JSON:', e.message); return; }
    log('← SD event:', ev.event, ev.context ? ev.context.slice(0, 8) : '');
    try { handleEvent(ev); } catch (e) { log('handleEvent crash:', e.stack || e.message); }
});

ws.on('error', err => log('WS error:', err.message));
ws.on('close', ()  => {
    log('WS closed — exiting so Stream Deck can restart');
    setTimeout(() => process.exit(0), 2000);
});

// ── Stream Deck event handler ─────────────────────────────────────────────────
function handleEvent({ event, context, payload }) {
    switch (event) {

        case 'willAppear':
            instances.set(context, (payload && payload.settings) || {});
            log('willAppear — settings:', instances.get(context));
            if (refreshTimers.has(context)) clearInterval(refreshTimers.get(context));
            refreshTimers.set(context, setInterval(() => refreshButton(context), 30_000));
            refreshButton(context);
            break;

        case 'willDisappear':
            instances.delete(context);
            prevScores.delete(context);
            prevState.delete(context);
            lastRender.delete(context);
            currentGame.delete(context);
            refreshing.delete(context);
            flashing.delete(context);
            if (refreshTimers.has(context)) {
                clearInterval(refreshTimers.get(context));
                refreshTimers.delete(context);
            }
            break;

        case 'didReceiveSettings':
            instances.set(context, (payload && payload.settings) || {});
            log('didReceiveSettings:', instances.get(context));
            lastRender.delete(context);
            refreshButton(context);
            break;

        case 'keyUp': {
            const game = currentGame.get(context);
            if (game && game.link) {
                log('keyUp — opening URL:', game.link);
                ws.send(JSON.stringify({ event: 'openUrl', payload: { url: game.link } }));
            } else {
                const cfg = instances.get(context) || {};
                const fallback = scheduleFallbackUrl(cfg.league);
                log('keyUp — no game, opening fallback:', fallback);
                if (fallback) ws.send(JSON.stringify({ event: 'openUrl', payload: { url: fallback } }));
                lastRender.delete(context);
                refreshButton(context);
            }
            break;
        }

        case 'sendToPlugin':
            if (payload && payload.event === 'requestTeams') {
                sendLiveTeams(context).catch(e => log('sendLiveTeams error:', e.message));
            } else if (payload && payload.settings) {
                instances.set(context, payload.settings);
                lastRender.delete(context);
                refreshButton(context);
            }
            break;
    }
}

function scheduleFallbackUrl(league) {
    if (league === 'ahl')  return 'https://theahl.com/stats/schedule';
    if (league === 'echl') return 'https://echl.com/schedule';
    return 'https://www.nhl.com/schedule';
}

// ── Refresh one button ────────────────────────────────────────────────────────
async function refreshButton(context) {
    if (refreshing.has(context)) { log('Refresh already in progress, skipping'); return; }
    if (flashing.has(context))   { log('Flash in progress, skipping refresh'); return; }

    const cfg = instances.get(context);
    if (!cfg || !cfg.teamId) {
        setButton(context, ['Select A', 'Team In', 'Settings']);
        return;
    }

    const league = cfg.league || 'nhl';

    refreshing.add(context);
    log('Refreshing', league, cfg.teamAbbr || cfg.teamId);
    try {
        const game = await fetchGame(league, cfg.teamId);
        currentGame.set(context, game || null);

        // Detect live → final transition and play fireworks
        const prevGameState = prevState.get(context);
        prevState.set(context, game ? game.state : null);
        if (prevGameState === 'live' && game && game.state === 'final') {
            const winnerIsHome = game.homeGoals >= game.awayGoals;
            const winnerId     = winnerIsHome ? game.homeId : game.awayId;
            log('Game over — fireworks for', teamName(league, winnerId));
            refreshing.delete(context);
            playFireworks(context, teamName(league, winnerId), teamColor(league, winnerId)).catch(e => log('fireworks error:', e.message));
            return;
        }

        const lines   = buildLines(game, cfg);
        const spacing = lines.some(l => typeof l === 'object') ? 1.2 : 1.4;
        log('→', JSON.stringify(lines));

        // Detect score change on live games and flash in the scoring team's color
        const prev = prevScores.get(context);
        if (game && game.state === 'live') {
            prevScores.set(context, { awayGoals: game.awayGoals, homeGoals: game.homeGoals });
            if (prev) {
                const awayScored = game.awayGoals > prev.awayGoals;
                const homeScored = game.homeGoals > prev.homeGoals;
                if (awayScored || homeScored) {
                    const color = (awayScored && homeScored) ? '#FFFFFF'
                        : awayScored ? teamColor(league, game.awayId)
                                     : teamColor(league, game.homeId);
                    log('Goal — flashing', color);
                    refreshing.delete(context);
                    flashButton(context, color, lines, spacing).catch(e => log('flashButton error:', e.message));
                    return;
                }
            }
        } else {
            prevScores.delete(context);
        }

        setButton(context, lines, spacing);
    } catch (err) {
        log('Fetch error:', err.message);
        setButton(context, [cfg.teamAbbr || league.toUpperCase(), 'Err']);
    } finally {
        refreshing.delete(context);
    }
}

// ── Build button display lines ────────────────────────────────────────────────
function buildLines(game, cfg) {
    const abbr = cfg.teamAbbr || (cfg.league || 'NHL').toUpperCase();
    if (!game)                     return [abbr, 'No Game'];
    if (game.state === 'nextgame') return [
        { text: 'Next Game', fs: 12, color: '#AAAAAA' },
        game.matchup,
        game.dateLabel + ' ' + game.time,
    ];
    if (game.state === 'preview')  return [game.matchup, game.time];
    if (game.state === 'ppd')      return [game.matchup, { text: 'PPD',   fs: 16, color: '#E74C3C' }];
    if (game.state === 'live')     return [
        { text: game.awayAbbr + ' ' + game.awayGoals, fs: 18 },
        { text: game.homeAbbr + ' ' + game.homeGoals, fs: 18 },
        { text: game.periodStr,                        fs: 11, color: '#FFD700' },
    ];
    if (game.state === 'final') {
        const label = game.endedIn === 'OT' ? 'Final/OT'
                    : game.endedIn === 'SO' ? 'Final/SO'
                    : 'Final';
        return [
            { text: game.awayAbbr + ' ' + game.awayGoals, fs: 18 },
            { text: game.homeAbbr + ' ' + game.homeGoals, fs: 18 },
            { text: label,                                 fs: 12, color: '#FFD700' },
        ];
    }
    return [abbr, '---'];
}

// ── League config ──────────────────────────────────────────────────────────────
// AHL / ECHL run on the HockeyTech/LeagueStat platform (lscluster.hockeytech.com) —
// the same backend that powers theahl.com and echl.com. The key + client_code below
// were captured from those sites' own public network traffic (same undocumented,
// no-signup access model as the NHL's api-web.nhle.com). They could rotate without
// notice; if scores stop loading for AHL/ECHL, that's the first thing to re-check.
const HOCKEYTECH = {
    ahl:  { key: 'ccb91f29d6744675', client_code: 'ahl',  site_id: '3' },
    echl: { key: '2c2b89ea7345cae8', client_code: 'echl', site_id: '0' },
};

// ── Team data (id → name, division, primary color) ────────────────────────────
// NHL is keyed by team abbreviation (matches api-web.nhle.com).
// AHL / ECHL are keyed by numeric HockeyTech team id (matches lscluster.hockeytech.com).
// AHL/ECHL colors are best-effort approximations of real team branding (the
// HockeyTech feed doesn't provide hex colors) — safe to refine later.
const TEAMS = {
    nhl: {
        'ANA': { abbr: 'ANA', name: 'Ducks',          color: '#F47A38' },
        'BOS': { abbr: 'BOS', name: 'Bruins',         color: '#FCB514' },
        'BUF': { abbr: 'BUF', name: 'Sabres',         color: '#003087' },
        'CAR': { abbr: 'CAR', name: 'Hurricanes',     color: '#CC0000' },
        'CBJ': { abbr: 'CBJ', name: 'Blue Jackets',   color: '#002654' },
        'CGY': { abbr: 'CGY', name: 'Flames',         color: '#C8102E' },
        'CHI': { abbr: 'CHI', name: 'Blackhawks',     color: '#CF0A2C' },
        'COL': { abbr: 'COL', name: 'Avalanche',      color: '#6F263D' },
        'DAL': { abbr: 'DAL', name: 'Stars',          color: '#006847' },
        'DET': { abbr: 'DET', name: 'Red Wings',      color: '#CE1126' },
        'EDM': { abbr: 'EDM', name: 'Oilers',         color: '#FF4C00' },
        'FLA': { abbr: 'FLA', name: 'Panthers',       color: '#C8102E' },
        'LAK': { abbr: 'LAK', name: 'Kings',          color: '#111111' },
        'MIN': { abbr: 'MIN', name: 'Wild',           color: '#154734' },
        'MTL': { abbr: 'MTL', name: 'Canadiens',      color: '#AF1E2D' },
        'NJD': { abbr: 'NJD', name: 'Devils',         color: '#CE1126' },
        'NSH': { abbr: 'NSH', name: 'Predators',      color: '#FFB81C' },
        'NYI': { abbr: 'NYI', name: 'Islanders',      color: '#00539B' },
        'NYR': { abbr: 'NYR', name: 'Rangers',        color: '#0038A8' },
        'OTT': { abbr: 'OTT', name: 'Senators',       color: '#E31837' },
        'PHI': { abbr: 'PHI', name: 'Flyers',         color: '#F74902' },
        'PIT': { abbr: 'PIT', name: 'Penguins',       color: '#FCB514' },
        'SEA': { abbr: 'SEA', name: 'Kraken',         color: '#001628' },
        'SJS': { abbr: 'SJS', name: 'Sharks',         color: '#006D75' },
        'STL': { abbr: 'STL', name: 'Blues',          color: '#002F87' },
        'TBL': { abbr: 'TBL', name: 'Lightning',      color: '#002868' },
        'TOR': { abbr: 'TOR', name: 'Maple Leafs',    color: '#00205B' },
        'UTA': { abbr: 'UTA', name: 'Mammoth',        color: '#69B3E7' },
        'VAN': { abbr: 'VAN', name: 'Canucks',        color: '#00843D' },
        'VGK': { abbr: 'VGK', name: 'Golden Knights', color: '#B4975A' },
        'WSH': { abbr: 'WSH', name: 'Capitals',       color: '#C8102E' },
        'WPG': { abbr: 'WPG', name: 'Jets',           color: '#041E42' },
    },
    ahl: {
        '384': { abbr: 'CLT', name: 'Checkers',       color: '#E03A3E' },
        '307': { abbr: 'HFD', name: 'Wolf Pack',      color: '#0038A8' },
        '319': { abbr: 'HER', name: 'Bears',          color: '#4E3629' },
        '313': { abbr: 'LV',  name: 'Phantoms',       color: '#F58426' },
        '309': { abbr: 'PRO', name: 'Bruins',         color: '#FFB81C' },
        '411': { abbr: 'SPR', name: 'Thunderbirds',   color: '#0066B3' },
        '316': { abbr: 'WBS', name: 'Penguins',       color: '#FCB514' },
        '330': { abbr: 'CHI', name: 'Wolves',         color: '#A6192E' },
        '328': { abbr: 'GR',  name: 'Griffins',       color: '#CE1126' },
        '389': { abbr: 'IA',  name: 'Wild',           color: '#154734' },
        '321': { abbr: 'MB',  name: 'Moose',          color: '#041E42' },
        '327': { abbr: 'MIL', name: 'Admirals',       color: '#FFB81C' },
        '372': { abbr: 'RFD', name: 'IceHogs',        color: '#CE0E2D' },
        '380': { abbr: 'TEX', name: 'Stars',          color: '#006847' },
        '413': { abbr: 'BEL', name: 'Senators',       color: '#C52032' },
        '373': { abbr: 'CLE', name: 'Monsters',       color: '#002654' },
        '457': { abbr: 'HAM', name: 'Hammers',        color: '#FFC627' },
        '415': { abbr: 'LAV', name: 'Rocket',         color: '#AF1E2D' },
        '323': { abbr: 'ROC', name: 'Americans',      color: '#002F6C' },
        '324': { abbr: 'SYR', name: 'Crunch',         color: '#003087' },
        '335': { abbr: 'TOR', name: 'Marlies',        color: '#00205B' },
        '390': { abbr: 'UTC', name: 'Comets',         color: '#C8102E' },
        '440': { abbr: 'ABB', name: 'Canucks',        color: '#00205B' },
        '402': { abbr: 'BAK', name: 'Condors',        color: '#FF4C00' },
        '444': { abbr: 'CGY', name: 'Wranglers',      color: '#C8102E' },
        '445': { abbr: 'CV',  name: 'Firebirds',      color: '#E4572E' },
        '419': { abbr: 'COL', name: 'Eagles',         color: '#6F263D' },
        '437': { abbr: 'HSK', name: 'Silver Knights', color: '#B4975A' },
        '403': { abbr: 'ONT', name: 'Reign',          color: '#582C83' },
        '404': { abbr: 'SD',  name: 'Gulls',          color: '#F47A38' },
        '405': { abbr: 'SJ',  name: 'Barracuda',      color: '#006D75' },
        '412': { abbr: 'TUC', name: 'Roadrunners',    color: '#8DC63F' },
    },
    echl: {
        '107': { abbr: 'BLM', name: 'Bison',           color: '#002855' },
        '5':   { abbr: 'CIN', name: 'Cyclones',        color: '#003DA5' },
        '60':  { abbr: 'FW',  name: 'Komets',          color: '#F58025' },
        '65':  { abbr: 'IND', name: 'Fuel',             color: '#F26522' },
        '50':  { abbr: 'KAL', name: 'Wings',           color: '#E03A3E' },
        '21':  { abbr: 'TOL', name: 'Walleye',         color: '#00843D' },
        '25':  { abbr: 'WHL', name: 'Nailers',         color: '#FFB81C' },
        '66':  { abbr: 'ALN', name: 'Americans',       color: '#002868' },
        '11':  { abbr: 'IDH', name: 'Steelheads',      color: '#00563F' },
        '68':  { abbr: 'KC',  name: 'Mavericks',       color: '#002F6C' },
        '114': { abbr: 'NM',  name: 'Goatheads',       color: '#C5A253' },
        '70':  { abbr: 'RC',  name: 'Rush',            color: '#007A87' },
        '106': { abbr: 'TAH', name: 'Knight Monsters', color: '#003057' },
        '71':  { abbr: 'TUL', name: 'Oilers',          color: '#F26522' },
        '72':  { abbr: 'WIC', name: 'Thunder',         color: '#002D62' },
        '74':  { abbr: 'ADK', name: 'Thunder',         color: '#002855' },
        '108': { abbr: 'GSO', name: 'Gargoyles',       color: '#4B0082' },
        '82':  { abbr: 'MNE', name: 'Mariners',        color: '#002F6C' },
        '76':  { abbr: 'NOR', name: 'Admirals',        color: '#041E42' },
        '17':  { abbr: 'REA', name: 'Royals',          color: '#4B2E83' },
        '113': { abbr: 'TRE', name: 'Ironhawks',       color: '#1C1C1C' },
        '99':  { abbr: 'TR',  name: 'Lions',           color: '#C8102E' },
        '77':  { abbr: 'WOR', name: 'Railers',         color: '#0A3161' },
        '10':  { abbr: 'ATL', name: 'Gladiators',      color: '#C8102E' },
        '8':   { abbr: 'FLA', name: 'Everblades',      color: '#002F6C' },
        '52':  { abbr: 'GVL', name: 'Swamp Rabbits',   color: '#00843D' },
        '79':  { abbr: 'JAX', name: 'Icemen',          color: '#041E42' },
        '61':  { abbr: 'ORL', name: 'Solar Bears',     color: '#0033A0' },
        '102': { abbr: 'SAV', name: 'Ghost Pirates',   color: '#00A99D' },
        '18':  { abbr: 'SC',  name: 'Stingrays',       color: '#002F6C' },
    },
};

const teamColor = (league, id) => TEAMS[league]?.[id]?.color || '#FFFFFF';
const teamName  = (league, id) => TEAMS[league]?.[id]?.name  || (id || '');
const teamAbbr  = (league, id) => TEAMS[league]?.[id]?.abbr  || String(id || '???');

// ── Period label (NHL only — AHL/ECHL use the feed's own period names) ────────
function periodLabel(period) {
    if (period === 4) return 'OT';
    if (period >= 5)  return 'SO';
    return ['', '1st', '2nd', '3rd'][period] || (period + 'th');
}

// ── Fetch dispatcher ──────────────────────────────────────────────────────────
function fetchGame(league, teamId) {
    if (league === 'ahl' || league === 'echl') return fetchHockeyTechGame(league, teamId);
    return fetchNhlGame(teamId);
}

// ── NHL API ───────────────────────────────────────────────────────────────────
function fetchNhlGame(teamAbbrVal) {
    return new Promise((resolve, reject) => {
        const now = new Date();
        // Don't roll to the next day's schedule until 2am — covers late-running games
        if (now.getHours() < 2) now.setDate(now.getDate() - 1);
        const date = now.getFullYear() + '-' +
                     String(now.getMonth() + 1).padStart(2, '0') + '-' +
                     String(now.getDate()).padStart(2, '0');
        const url = 'https://api-web.nhle.com/v1/score/' + date;

        const req = https.get(url, { headers: { 'User-Agent': 'StreamDeckHockeyScores/1.0' } }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const game = parseNhlScores(JSON.parse(body), teamAbbrVal);
                    if (game) return resolve(game);
                    // Off day — look ahead instead of a dead-end "No Game"
                    fetchNhlNextGame(teamAbbrVal).then(resolve).catch(() => resolve(null));
                }
                catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

// GET a URL as parsed JSON, following redirects (api-web.nhle.com uses a 307 to
// resolve keywords like ".../now" to a concrete dated URL — plain https.get()
// does not follow those on its own).
function httpsGetJson(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'StreamDeckHockeyScores/1.0' } }, res => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                httpsGetJson(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
                return;
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

// ── Next scheduled game (shown on off days instead of a dead-end "No Game") ──
// The club-schedule "week" view returns a rolling window starting today; chase
// nextStartDate forward a few times to cover gaps longer than a week (All-Star
// break, playoff layoffs) without walking arbitrarily far into the off-season.
async function fetchNhlNextGame(teamAbbrVal, weekStart = 'now', hopsLeft = 4) {
    const url  = 'https://api-web.nhle.com/v1/club-schedule/' + teamAbbrVal + '/week/' + weekStart;
    const data = await httpsGetJson(url);

    const games = (data?.games || []).slice().sort((a, b) => new Date(a.startTimeUTC) - new Date(b.startTimeUTC));
    const g     = games.find(g => g.gameState === 'FUT' || g.gameState === 'PRE');

    if (g) {
        const awayId    = g.awayTeam?.abbrev || '???';
        const homeId    = g.homeTeam?.abbrev || '???';
        const matchup   = awayId + ' @ ' + homeId;
        const gameDate  = g.gameDate || '';
        const link      = buildNhlGameUrl(awayId, homeId, gameDate, g.id);
        const dateLabel = new Date(g.startTimeUTC).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
        return { state: 'nextgame', matchup, dateLabel, time: fmtTime(g.startTimeUTC), awayId, homeId, link };
    }

    if (hopsLeft > 0 && data?.nextStartDate) {
        return fetchNhlNextGame(teamAbbrVal, data.nextStartDate, hopsLeft - 1);
    }
    return null;
}

function parseNhlScores(data, teamAbbrVal) {
    try {
        const games = data?.games;
        if (!games?.length) { log('NHL API: no games today'); return null; }

        const g = games.find(g =>
            g?.awayTeam?.abbrev === teamAbbrVal || g?.homeTeam?.abbrev === teamAbbrVal
        );
        if (!g) { log('NHL API: no game for', teamAbbrVal); return null; }

        const awayId   = g.awayTeam?.abbrev || '???';
        const homeId   = g.homeTeam?.abbrev || '???';
        const awayAbbr = awayId, homeAbbr = homeId;
        const matchup  = awayAbbr + ' @ ' + homeAbbr;
        const gameId   = g.id;
        const gameDate = g.gameDate || '';
        const state    = g.gameState || '';
        const link     = buildNhlGameUrl(awayAbbr, homeAbbr, gameDate, gameId);

        log('NHL API:', state, matchup, 'id=' + gameId);

        // Postponed / cancelled
        const schedState = (g.gameScheduleState || '').toUpperCase();
        if (schedState === 'PPD' || schedState === 'CNCL') {
            return { state: 'ppd', matchup, awayId, homeId, awayAbbr, homeAbbr, link };
        }

        // Pre-game / future
        if (state === 'FUT' || state === 'PRE') {
            return { state: 'preview', matchup, time: fmtTime(g.startTimeUTC), awayId, homeId, awayAbbr, homeAbbr, link };
        }

        const awayGoals = g.awayTeam?.score ?? 0;
        const homeGoals = g.homeTeam?.score ?? 0;

        // Final
        if (state === 'FINAL' || state === 'OFF') {
            const endedIn = g.gameOutcome?.lastPeriodType || 'REG'; // 'REG', 'OT', 'SO'
            return { state: 'final', matchup, awayId, homeId, awayAbbr, homeAbbr, awayGoals, homeGoals, endedIn, link };
        }

        // Live (LIVE or CRIT)
        const period         = g.period || 1;
        const timeRemaining  = g.clock?.timeRemaining || '??:??';
        const inIntermission = g.clock?.inIntermission || false;
        const pLabel         = periodLabel(period);
        const periodStr      = pLabel === 'SO'   ? 'SO'
                             : inIntermission     ? pLabel + ' INT'
                             : pLabel + ' ' + timeRemaining;

        return { state: 'live', matchup, awayId, homeId, awayAbbr, homeAbbr, awayGoals, homeGoals, period, periodStr, link };

    } catch (e) {
        log('parseNhlScores error:', e.message);
        return null;
    }
}

function buildNhlGameUrl(awayAbbr, homeAbbr, gameDate, gameId) {
    if (!gameId) return 'https://www.nhl.com';
    const away = awayAbbr.toLowerCase();
    const home = homeAbbr.toLowerCase();
    const date = (gameDate || '').replace(/-/g, '/');
    return `https://www.nhl.com/gamecenter/${away}-vs-${home}/${date}/${gameId}`;
}

// ── AHL / ECHL — HockeyTech API ────────────────────────────────────────────────
async function fetchHockeyTechGame(league, teamId) {
    const conf = HOCKEYTECH[league];
    const url  = 'https://lscluster.hockeytech.com/feed/index.php' +
        '?feed=modulekit&view=scorebar&numberofdaysback=3&numberofdaysahead=3' +
        '&key=' + conf.key + '&client_code=' + conf.client_code + '&site_id=' + conf.site_id +
        '&lang=en&fmt=json';

    const data = await httpsGetJson(url);
    const game = parseHockeyTechScores(data, league, teamId);
    if (game) return game;

    // Off day — look ahead instead of a dead-end "No Game"
    try { return await fetchHockeyTechNextGame(league, teamId); }
    catch (e) { log('fetchHockeyTechNextGame error:', e.message); return null; }
}

// ── Next scheduled game (shown on off days instead of a dead-end "No Game") ──
// Widens the window to a forward-only 21 days (roughly MLB's 2-week lookahead,
// padded for AHL/ECHL's less frequent schedule) since the normal ±3 day scorebar
// call above already came back empty for this team.
async function fetchHockeyTechNextGame(league, teamId) {
    const conf = HOCKEYTECH[league];
    const url  = 'https://lscluster.hockeytech.com/feed/index.php' +
        '?feed=modulekit&view=scorebar&numberofdaysback=0&numberofdaysahead=21' +
        '&key=' + conf.key + '&client_code=' + conf.client_code + '&site_id=' + conf.site_id +
        '&lang=en&fmt=json';

    const data  = await httpsGetJson(url);
    const games = data?.SiteKit?.Scorebar || [];
    const matches = games
        .filter(g => String(g.HomeID) === String(teamId) || String(g.VisitorID) === String(teamId))
        .filter(g => classifyHockeyTechStatus(g).state === 'preview')
        .sort((a, b) => new Date(a.GameDateISO8601 || a.Date) - new Date(b.GameDateISO8601 || b.Date));

    if (!matches.length) { log(league.toUpperCase() + ' API: no upcoming games in next 21 days for', teamId); return null; }

    const g         = matches[0];
    const awayId    = String(g.VisitorID);
    const homeId    = String(g.HomeID);
    const awayAbbr  = g.VisitorCode || teamAbbr(league, awayId);
    const homeAbbr  = g.HomeCode    || teamAbbr(league, homeId);
    const matchup   = awayAbbr + ' @ ' + homeAbbr;
    const link      = 'https://lscluster.hockeytech.com/game_reports/official-game-report.php' +
                       '?client_code=' + conf.client_code + '&game_id=' + g.ID + '&lang_id=1';
    const startISO  = g.GameDateISO8601 || g.Date;
    const dateLabel = new Date(startISO).toLocaleDateString([], { month: 'numeric', day: 'numeric' });

    return { state: 'nextgame', matchup, dateLabel, time: g.ScheduledFormattedTime || fmtTime(startISO), awayId, homeId, awayAbbr, homeAbbr, link };
}

// Picks the single most relevant game for this team out of the ±3 day window:
// a game in progress beats an upcoming game, which beats a past final (so the
// button holds the last result until the next game appears on the schedule).
function parseHockeyTechScores(data, league, teamId) {
    try {
        const games = data?.SiteKit?.Scorebar;
        if (!games?.length) { log(league.toUpperCase() + ' API: no games in window'); return null; }

        const matches = games.filter(g => String(g.HomeID) === String(teamId) || String(g.VisitorID) === String(teamId));
        if (!matches.length) { log(league.toUpperCase() + ' API: no games found for team', teamId); return null; }

        let best = null, bestRank = -1, bestTime = null;
        for (const g of matches) {
            const rank = classifyHockeyTechStatus(g).rank;
            const time = new Date(g.GameDateISO8601 || g.Date).getTime();
            if (rank > bestRank) {
                best = g; bestRank = rank; bestTime = time;
            } else if (rank === bestRank) {
                if (rank === 2 && time < bestTime) { best = g; bestTime = time; } // soonest upcoming
                if (rank === 1 && time > bestTime) { best = g; bestTime = time; } // most recent final
            }
        }
        return parseHockeyTechGame(best, league);
    } catch (e) {
        log('parseHockeyTechScores error:', e.message);
        return null;
    }
}

// The HockeyTech scorebar feed doesn't document numeric GameStatus codes, so
// state is derived from the human-readable GameStatusString(Long) fields plus
// the scheduled start time — the same signals the AHL/ECHL sites' own scoreboard
// widgets read. NOTE: written and tested against off-season data (finals only);
// worth spot-checking once AHL/ECHL preseason games are live in October.
function classifyHockeyTechStatus(g) {
    const str  = (g.GameStatusString || '').toLowerCase();
    const long = (g.GameStatusStringLong || '').toLowerCase();

    if (str.includes('ppd') || str.includes('postpon') || str.includes('cancel')) {
        return { state: 'ppd', rank: 1 };
    }
    if (str.includes('final')) return { state: 'final', rank: 1 };

    const startMs = new Date(g.GameDateISO8601 || g.Date).getTime();
    if (Number.isFinite(startMs) && Date.now() < startMs) return { state: 'preview', rank: 2 };

    return { state: 'live', rank: 3 };
}

function parseHockeyTechGame(g, league) {
    const awayId   = String(g.VisitorID);
    const homeId   = String(g.HomeID);
    const awayAbbr = g.VisitorCode || teamAbbr(league, awayId);
    const homeAbbr = g.HomeCode    || teamAbbr(league, homeId);
    const matchup  = awayAbbr + ' @ ' + homeAbbr;
    const link     = 'https://lscluster.hockeytech.com/game_reports/official-game-report.php' +
                      '?client_code=' + HOCKEYTECH[league].client_code + '&game_id=' + g.ID + '&lang_id=1';

    const status = classifyHockeyTechStatus(g);

    if (status.state === 'ppd')     return { state: 'ppd', matchup, awayId, homeId, awayAbbr, homeAbbr, link };
    if (status.state === 'preview') return { state: 'preview', matchup, time: g.ScheduledFormattedTime || fmtTime(g.GameDateISO8601), awayId, homeId, awayAbbr, homeAbbr, link };

    const awayGoals = parseInt(g.VisitorGoals, 10) || 0;
    const homeGoals = parseInt(g.HomeGoals, 10)    || 0;

    if (status.state === 'final') {
        const long    = (g.GameStatusStringLong || '').toUpperCase();
        const endedIn = long.includes('SO') ? 'SO' : long.includes('OT') ? 'OT' : 'REG';
        return { state: 'final', matchup, awayId, homeId, awayAbbr, homeAbbr, awayGoals, homeGoals, endedIn, link };
    }

    // Live — the feed's own period naming (e.g. "3rd", "OT1") is already
    // display-ready, unlike the NHL feed which only gives a numeric period.
    const pLabel    = g.PeriodNameShort || (g.Period ? g.Period + '' : '1st');
    const inInt     = g.Intermission === '1' || g.Intermission === 1;
    const periodStr = /so/i.test(pLabel)  ? 'SO'
                     : inInt               ? pLabel + ' INT'
                     : pLabel + ' ' + (g.GameClock || '');

    return { state: 'live', matchup, awayId, homeId, awayAbbr, homeAbbr, awayGoals, homeGoals, period: parseInt(g.Period, 10) || 1, periodStr, link };
}

// ── Live team lists (for the property inspector's search/browse UI) ───────────
// The hardcoded TEAMS map above still drives colors and is the PI's offline
// fallback, but the actual id/name/division list is refreshed from each
// league's own API on request so AHL/ECHL expansion teams and realignments
// show up without a plugin update. Cached in memory per plugin process.
const TEAM_LIST_CACHE = {}; // league -> { fetchedAt, teams: [{value, abbr, name, division}] }
const TEAM_LIST_TTL   = 24 * 60 * 60 * 1000; // 24h

async function getLiveTeamList(league) {
    const cached = TEAM_LIST_CACHE[league];
    if (cached && (Date.now() - cached.fetchedAt) < TEAM_LIST_TTL) return cached.teams;

    try {
        const teams = league === 'nhl' ? await fetchNhlTeamList() : await fetchHockeyTechTeamList(league);
        if (teams && teams.length) {
            TEAM_LIST_CACHE[league] = { fetchedAt: Date.now(), teams };
            return teams;
        }
        throw new Error('empty team list');
    } catch (e) {
        log('getLiveTeamList(' + league + ') failed, ' + (cached ? 'serving stale cache' : 'no cache available') + ':', e.message);
        return cached ? cached.teams : null;
    }
}

async function fetchNhlTeamList() {
    const data = await httpsGetJson('https://api-web.nhle.com/v1/standings/now');
    return (data?.standings || [])
        .map(t => ({
            value: t.teamAbbrev?.default,
            abbr: t.teamAbbrev?.default,
            name: t.teamName?.default,
            division: t.divisionName,
        }))
        .filter(t => t.value && t.name)
        .sort((a, b) => a.name.localeCompare(b.name));
}

// HockeyTech requires a season_id per request rather than a "current" keyword —
// look it up from the league's own seasons list instead of hardcoding one, so
// this keeps working across season rollovers without a plugin update.
async function fetchHockeyTechCurrentSeasonId(league) {
    const conf = HOCKEYTECH[league];
    const url  = 'https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=seasons' +
        '&key=' + conf.key + '&client_code=' + conf.client_code + '&site_id=' + conf.site_id + '&lang=en&fmt=json';
    const data    = await httpsGetJson(url);
    const seasons = data?.SiteKit?.Seasons || [];
    const regular = seasons
        .filter(s => s.career === '1' && s.playoff === '0')
        .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    if (!regular.length) throw new Error('no regular season found in seasons list');
    return regular[0].season_id;
}

async function fetchHockeyTechTeamList(league) {
    const conf     = HOCKEYTECH[league];
    const seasonId = await fetchHockeyTechCurrentSeasonId(league);
    const url = 'https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=teamsbyseason' +
        '&season_id=' + seasonId + '&key=' + conf.key + '&client_code=' + conf.client_code +
        '&site_id=' + conf.site_id + '&lang=en&fmt=json';
    const data = await httpsGetJson(url);
    return (data?.SiteKit?.Teamsbyseason || [])
        .map(t => ({ value: String(t.id), abbr: t.code, name: t.name, division: t.division_short_name }))
        .filter(t => t.value && t.abbr && t.name)
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetches all 3 leagues' live team lists (each independently — one league
// failing doesn't block the others) and relays them to the property inspector
// that asked for them.
async function sendLiveTeams(context) {
    const [nhl, ahl, echl] = await Promise.all([
        getLiveTeamList('nhl').catch(e  => { log('nhl team list error:', e.message);  return null; }),
        getLiveTeamList('ahl').catch(e  => { log('ahl team list error:', e.message);  return null; }),
        getLiveTeamList('echl').catch(e => { log('echl team list error:', e.message); return null; }),
    ]);

    const teams = {};
    if (nhl)  teams.nhl  = nhl;
    if (ahl)  teams.ahl  = ahl;
    if (echl) teams.echl = echl;

    if (!Object.keys(teams).length) { log('sendLiveTeams: all 3 leagues failed, PI keeps its static fallback'); return; }

    log('Sending live team data to PI:', Object.keys(teams).map(l => l + '=' + teams[l].length).join(', '));
    ws.send(JSON.stringify({ event: 'sendToPropertyInspector', context, payload: { event: 'teamsData', teams } }));
}

function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return '?:??'; }
}

// ── SVG button renderer ───────────────────────────────────────────────────────
function escXml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function makeImage(lines, lineSpacing = 1.4, bgColor = 'black') {
    const W = 72, H = 72, PAD = 4, MAX_W = W - PAD * 2;

    const items = lines.map(l => {
        if (typeof l === 'string') {
            let fs = 16;
            while (fs > 8 && l.length * fs * 0.60 > MAX_W) fs--;
            return { text: l, fs };
        }
        return l;
    });

    const lineHeights = items.map(({ fs }) => fs * lineSpacing);
    const totalH      = lineHeights.reduce((a, b) => a + b, 0);
    let   y           = (H - totalH) / 2 + items[0].fs * 0.80;

    const rows = items.map(({ text, fs, color }, i) => {
        if (i > 0) y += lineHeights[i - 1] - items[i - 1].fs * 0.80 + fs * 0.80;
        return `<text x="36" y="${y.toFixed(1)}" text-anchor="middle" fill="${color || 'white'}" ` +
               `font-family="Helvetica Neue,Arial,sans-serif" font-size="${fs}" font-weight="600">${escXml(text)}</text>`;
    }).join('');

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="144" height="144" overflow="hidden">` +
        `<rect width="${W}" height="${H}" fill="${bgColor}"/>` +
        rows + `</svg>`;

    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

function makeFireworks(frame, winnerColor, winnerName) {
    const W = 72, H = 72;
    const cx = 36, cy = 36;
    const COLORS = [winnerColor, '#FFD700', '#FFFFFF'];

    let circles = '';
    [0, 4, 8, 12, 16, 20, 24, 28, 32, 36].forEach((startFrame, burstIdx) => {
        const f = frame - startFrame;
        if (f < 0 || f >= 6) return;
        const progress = f / 5;
        const r        = 5 + progress * 28;
        const pSize    = Math.max(0.5, 3.5 - progress * 2.5);
        const opacity  = (1 - progress * 0.65).toFixed(2);
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45 + burstIdx * 22.5) * Math.PI / 180;
            const px    = (cx + r * Math.cos(angle)).toFixed(1);
            const py    = (cy + r * Math.sin(angle)).toFixed(1);
            const color = COLORS[(i + burstIdx) % COLORS.length];
            circles += `<circle cx="${px}" cy="${py}" r="${pSize.toFixed(1)}" fill="${color}" opacity="${opacity}"/>`;
        }
    });

    const throb   = Math.floor(frame / 2) % 2 === 0;
    const winSize = throb ? 20 : 16;
    let nameSize  = 13;
    while (nameSize > 7 && winnerName.length * nameSize * 0.62 > 62) nameSize--;
    const nameY = throb ? 25 : 27;

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="144" height="144" overflow="hidden">` +
        `<rect width="${W}" height="${H}" fill="black"/>` +
        circles +
        `<text x="36" y="${nameY}" text-anchor="middle" fill="white" ` +
        `font-family="Helvetica Neue,Arial,sans-serif" font-size="${nameSize}" font-weight="700">${escXml(winnerName)}</text>` +
        `<text x="36" y="50" text-anchor="middle" fill="#FFD700" ` +
        `font-family="Helvetica Neue,Arial,sans-serif" font-size="${winSize}" font-weight="800">WIN!</text>` +
        `</svg>`;

    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

async function playFireworks(context, winnerName, winnerColor) {
    if (flashing.has(context)) return;
    flashing.add(context);
    log('→ fireworks for', winnerName, winnerColor);
    try {
        for (let i = 0; i < 42; i++) {
            const img = makeFireworks(i, winnerColor, winnerName);
            ws.send(JSON.stringify({ event: 'setImage', context, payload: { image: img, target: 0 } }));
            await sleep(120);
        }
    } finally {
        flashing.delete(context);
        lastRender.delete(context);
        refreshButton(context);
    }
}

function setButton(context, lines, lineSpacing, bgColor) {
    const key = JSON.stringify(lines);
    if (!bgColor && lastRender.get(context) === key) return;
    if (!bgColor) lastRender.set(context, key);
    ws.send(JSON.stringify({ event: 'setImage', context, payload: { image: makeImage(lines, lineSpacing, bgColor), target: 0 } }));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function flashButton(context, color, lines, spacing) {
    if (flashing.has(context)) return;
    flashing.add(context);
    log('→ flash', color);
    try {
        for (let i = 0; i < 4; i++) {
            setButton(context, lines, spacing, color);
            await sleep(200);
            setButton(context, lines, spacing, 'black');
            await sleep(200);
        }
    } finally {
        flashing.delete(context);
        setButton(context, lines, spacing, 'black');
    }
}
