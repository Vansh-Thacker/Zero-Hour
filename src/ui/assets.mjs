// Every picture the screens use, in one place. All of it is supplied in the pack:
// the ScottishPower logo, 3D renders of each control, and the scenery and incident artwork.
// Paths start at the pack folder, which is what `npm start` serves.

const pack = path => '/' + path;

export const LOGO = pack('1-foundation/artwork/brand/scottishpower_logo_cropped.png');

// 3D render of each control, by ID (2-extend/previews/controls/).
const CONTROL_RENDERS = {
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

// The three controls already in place have no ID in challenge.json, so match by name.
const IN_PLACE_RENDERS = [
  ['firewall', 'IP_firewall_and_ddos_protection'],
  ['vulnerability', 'IP_vulnerability_scanning'],
  ['penetration', 'IP_penetration_testing'],
];

export function controlRender(control) {
  const file = CONTROL_RENDERS[control.id]
    ?? IN_PLACE_RENDERS.find(([word]) => control.name.toLowerCase().includes(word))?.[1];
  return file ? pack(`2-extend/previews/controls/${file}.png`) : null;
}

// For each phase: a piece of "evidence" (a screen from the incident) and a 3D object.
// Picked to match the story in challenge.json.
export const PHASE_ART = [
  {evidence: pack('2-extend/artwork/incident/email.svg'), object: pack('2-extend/previews/scenery/everyday_E1-email.png')},
  {evidence: pack('2-extend/previews/scenery/incident_monitor.png'), object: pack('2-extend/previews/scenery/everyday_E2-laptop.png')},
  {evidence: pack('2-extend/artwork/incident/call.svg'), object: pack('2-extend/previews/scenery/everyday_E3-phone.png')},
  {evidence: pack('2-extend/artwork/incident/recovery.svg'), object: pack('2-extend/previews/scenery/incident_desk.png')},
];

export const SCENE = {
  office: pack('2-extend/previews/scenery/office.png'),
  substation: pack('2-extend/previews/scenery/substation.png'),
  turbine: pack('2-extend/previews/scenery/wind_turbine.png'),
  operator: pack('2-extend/previews/scenery/incident_operator.png'),
  usb: pack('2-extend/previews/scenery/everyday_E4-usb.png'),
  chat: pack('2-extend/artwork/incident/chat.svg'),
};
