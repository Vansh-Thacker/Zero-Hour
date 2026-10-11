import qrcode from '../vendor/qrcode.mjs';
import {joinLinks} from '../net/joinLinks.mjs';
import {el} from './dom.mjs';

let cachedUrl, cachedImage;
let chosenCode, chosenUrl;

// Encode in this browser, offline. Six pixels/module and a four-module white
// quiet zone keep the image crisp and scannable. Cache across live room redraws.
export function joinQrImage(url) {
  if (url === cachedUrl) return cachedImage;
  const qr = qrcode(0, 'M');
  qr.addData(new URL(url).href, 'Byte');
  qr.make();
  const image = qr.createDataURL(6, 24);
  cachedUrl = url;
  cachedImage = image;
  return image;
}

export function roomInvite({code, addresses = [], state}) {
  if (state?.confirmed) return el('p', {class: 'room-join'}, '🔒 Joining is closed while the night is running.');
  const links = joinLinks(addresses, code);
  if (!links.length) return el('p', {class: 'room-join'},
    'To show a phone QR code, connect this laptop to Wi-Fi and open the host page using its network address. Players can still enter the room code on the join page.');

  if (chosenCode !== code || !links.includes(chosenUrl)) {
    chosenCode = code;
    chosenUrl = links[0];
  }
  const picture = el('img', {class: 'room-qr', width: 240, height: 240,
    alt: `Scan to join room ${code}`, 'data-key': 'join-qr'});
  const link = el('a', {target: '_blank', rel: 'noopener', 'data-key': 'join-link'});
  const status = el('p', {class: 'room-qr-status', role: 'status'});
  const update = url => {
    chosenUrl = url;
    link.setAttribute('href', url);
    link.textContent = url.replace(/^https?:\/\//, '');
    try {
      picture.setAttribute('src', joinQrImage(url));
      picture.hidden = false;
      status.textContent = '';
    } catch {
      picture.hidden = true;
      status.textContent = 'QR code unavailable. Use the join link or room code instead.';
    }
  };
  update(chosenUrl);

  const chooser = links.length > 1 ? el('label', {class: 'room-network'}, 'Phone connection',
    el('select', {'data-key': 'join-network', onchange: event => {
      if (links.includes(event.currentTarget.value)) update(event.currentTarget.value);
    }}, links.map(url => el('option', {value: url, selected: url === chosenUrl}, new URL(url).host)))) : null;

  return el('div', {class: 'room-invite'},
    el('strong', {class: 'room-invite-title'}, 'Scan to join'),
    picture,
    el('p', {class: 'room-join'}, 'Open your phone camera, scan, then enter your name and team. Or join with the room code above.'),
    chooser, link,
    el('p', {class: 'room-join'}, 'For a laptop-hosted game, use the same Wi-Fi or hotspot. If scanning cannot connect, choose the laptop’s Wi-Fi address.'),
    status);
}
