/**
 * artwork.mjs
 * ------------
 * Every piece of pack artwork the theme uses, in one place.
 *
 * Paths are worked out from this file's own location (import.meta.url), so the
 * images load correctly whichever page shows the theme (the game or the preview).
 *
 * What we use and why is listed in README.md under "Artwork".
 */

/** Turns a path inside the pack into a full URL the browser can load. */
function packFile(pathFromPackRoot) {
  return new URL(`../../${pathFromPackRoot}`, import.meta.url).href;
}

// ---------------------------------------------------------------------------
// Control icons: 1-foundation/artwork/icons/
// ---------------------------------------------------------------------------

/** Icon file for each control ID that can be chosen. */
const CONTROL_ICON_FILES = {
  P1: 'P1_endpoint_protection',
  P2: 'P2_network_segmentation',
  P3: 'P3_patching_and_updates',
  P4: 'P4_secure_by_design',
  P5: 'P5_training_and_awareness',
  P6: 'P6_email_security',
  P7: 'P7_multi_factor_authentication',
  D1: 'D1_siem',
  D2: 'D2_intrusion_detection_and_prevention',
  D3: 'D3_threat_hunting_and_honeypots',
  D4: 'D4_managed_detection_and_response',
  D5: 'D5_network_behaviour_analysis',
  R1: 'R1_incident_response_plan',
  R2: 'R2_incident_response_team_24_7',
  R3: 'R3_incident_response_team_office_hours',
  R4: 'R4_backup_restores',
  R5: 'R5_digital_forensics',
  R6: 'R6_incident_response_retainer',
};

/** Icons for the three controls already in place, matched by their real name. */
const IN_PLACE_ICON_FILES = [
  { match: 'firewall', file: 'IP_firewall_and_ddos_protection' },
  { match: 'penetration', file: 'IP_penetration_testing' },
  { match: 'vulnerability', file: 'IP_vulnerability_scanning' },
];

/**
 * The icon URL for a control, or null if there is no icon for it.
 * @param {{ id: string, name: string }} control
 */
export function controlIcon(control) {
  const file = CONTROL_ICON_FILES[control.id]
    ?? IN_PLACE_ICON_FILES.find(entry => control.name.toLowerCase().includes(entry.match))?.file;
  return file ? packFile(`1-foundation/artwork/icons/${file}.svg`) : null;
}

// ---------------------------------------------------------------------------
// Scene artwork
// ---------------------------------------------------------------------------

/**
 * One picture per phase, matching the story in challenge.json:
 * 1 the phishing email, 2 the infected laptop, 3 the fake "IT" phone call,
 * 4 the ransom demand message.
 */
const PHASE_PICTURES = [
  '1-foundation/artwork/everyday/email.svg',
  '1-foundation/artwork/everyday/laptop.svg',
  '1-foundation/artwork/everyday/phone.svg',
  '2-extend/artwork/incident/chat.svg',
];

/** The everyday picture for phase n (0 to 3). */
export function phasePicture(n) {
  const path = PHASE_PICTURES[n];
  return path ? packFile(path) : null;
}

/** Map markers for the three defence layers on the blueprint. */
const LAYER_MARKER_PATHS = {
  Prevent: '2-extend/artwork/map/marker_reduces.svg',
  Detect: '2-extend/artwork/map/marker_sees.svg',
  Respond: '2-extend/artwork/map/marker_recovers.svg',
};

/** Everything else the theme shows, by where it appears. */
const SCENE_PATHS = {
  outside: '2-extend/artwork/map/outside_node.svg',     // the street, where the crew starts
  crew: '1-foundation/artwork/everyday/usb_stick.svg',  // the crew's marker: their malicious device
  room: '2-extend/artwork/map/system_node.svg',         // each room on the blueprint
  vault: '2-extend/artwork/map/platform.svg',           // the data vault
  building: '2-extend/artwork/scenery/office.svg',      // the company's building in the header
  architect: '2-extend/artwork/incident/call.svg',      // The Architect calls in
  foiled: '2-extend/artwork/incident/recovery.svg',     // ending: the vault holds
  escaped: '2-extend/artwork/incident/email.svg',       // ending: the ransom demand arrives
};

/** Turns { key: path } into { key: url }. */
const toUrls = paths => Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, packFile(path)]));

export const LAYER_MARKERS = toUrls(LAYER_MARKER_PATHS);
export const SCENE = toUrls(SCENE_PATHS);

/**
 * Every artwork path the theme uses, relative to the pack folder.
 * The tests check that each of these files really exists.
 */
export function allArtworkPaths() {
  return [
    ...Object.values(CONTROL_ICON_FILES).map(file => `1-foundation/artwork/icons/${file}.svg`),
    ...IN_PLACE_ICON_FILES.map(entry => `1-foundation/artwork/icons/${entry.file}.svg`),
    ...PHASE_PICTURES,
    ...Object.values(LAYER_MARKER_PATHS),
    ...Object.values(SCENE_PATHS),
  ];
}
