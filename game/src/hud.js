// The HUD: plain DOM over the canvas, updated from the simulation state once per render
// frame. Health and armour bottom-left, money and ammunition bottom-right, the round clock
// and score top-centre, a killfeed top-right, and centre-screen furniture: crosshair (its
// gap follows the shooter's true spread), hitmarker, channel bar for planting and defusing,
// the buy menu and the round banners. Nothing here touches the simulation; main.js feeds it.

import { WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';
import { PALETTE } from './palette.js';

// The buy menu's rows, in key order. main.js applies the purchase; this table is only what
// the menu shows and what each key means.
export const BUY_CATALOG = [
  { key: 'Digit1', kind: 'weapon', id: 'smg', label: WEAPONS.smg.name, price: WEAPONS.smg.price },
  { key: 'Digit2', kind: 'weapon', id: 'rifle', label: WEAPONS.rifle.name, price: WEAPONS.rifle.price },
  { key: 'Digit3', kind: 'weapon', id: 'shotgun', label: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price },
  { key: 'Digit4', kind: 'weapon', id: 'sniper', label: WEAPONS.sniper.name, price: WEAPONS.sniper.price },
  { key: 'Digit5', kind: 'weapon', id: 'rifle_ammo', label: 'Reserve ammunition', price: 150 },
  { key: 'Digit6', kind: 'armor', id: 'armor', label: 'Kevlar vest', price: ARMOR_PRICE },
  { key: 'Digit7', kind: 'grenade', id: 'frag', label: GRENADES.frag.name, price: GRENADES.frag.price },
  { key: 'Digit8', kind: 'grenade', id: 'flash', label: GRENADES.flash.name, price: GRENADES.flash.price },
  { key: 'Digit9', kind: 'grenade', id: 'smoke', label: GRENADES.smoke.name, price: GRENADES.smoke.price },
];

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hpBar: $('hp-bar'), hpNum: $('hp-num'), armorTag: $('armor-tag'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    money: $('money'), timer: $('timer'), scoreA: $('score-a'), scoreB: $('score-b'),
    roundNum: $('round-num'), aliveA: $('alive-a'), aliveB: $('alive-b'),
    objective: $('objective'), killfeed: $('killfeed'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    bannerWrap: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    buyMenu: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'), buyTimer: $('buy-timer'),
    progressWrap: $('progress'), progressBar: $('progress-bar'), progressLabel: $('progress-label'),
    vignette: $('vignette'), flashOverlay: $('flash-overlay'),
    chargeTag: $('charge-tag'), scope: $('scope'),
    startOverlay: $('start-overlay'), endOverlay: $('end-overlay'),
    endTitle: $('end-title'), endSub: $('end-sub'),
    startTitle: $('start-title'), startCopy: $('start-copy'), playBtn: $('play'),
  };
  let bannerUntil = 0;
  let hitmarkUntil = 0;

  function feed(html, color) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.style.color = color ?? PALETTE.ink;
    row.innerHTML = html;
    el.killfeed.prepend(row);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    setTimeout(() => row.classList.add('old'), 4200);
    setTimeout(() => row.remove(), 5200);
  }

  return {
    el,
    feed,
    banner(title, sub, seconds, now) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub ?? '';
      el.bannerWrap.hidden = false;
      bannerUntil = now + seconds;
    },
    hitmark(now, kill) {
      hitmarkUntil = now + (kill ? 0.3 : 0.14);
      el.hitmarker.classList.toggle('kill', kill);
    },
    update(now, view) {
      if (!el.bannerWrap.hidden && now > bannerUntil) el.bannerWrap.hidden = true;
      el.hitmarker.style.opacity = now < hitmarkUntil ? '1' : '0';
      // Health
      el.hpBar.style.width = `${Math.max(0, view.hp)}%`;
      el.hpBar.style.background = view.hp <= 30 ? PALETTE.danger : PALETTE.accent;
      el.hpNum.textContent = String(Math.max(0, Math.ceil(view.hp)));
      el.armorTag.style.visibility = view.armor ? 'visible' : 'hidden';
      // Gun
      el.ammoMag.textContent = String(view.mag);
      el.ammoReserve.textContent = `/ ${view.reserve}`;
      el.weaponName.textContent = view.weaponName;
      el.money.textContent = `$${view.money}`;
      el.ammoMag.style.color = view.mag === 0 ? PALETTE.danger : PALETTE.ink;
      // Clock and score
      const t = Math.max(0, Math.ceil(view.timeLeft));
      el.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      el.timer.style.color = view.timeLeft <= 10 && view.phase === 'live' ? PALETTE.danger : PALETTE.ink;
      el.scoreA.textContent = String(view.rounds[0]);
      el.scoreB.textContent = String(view.rounds[1]);
      el.roundNum.textContent = `ROUND ${view.round}`;
      el.aliveA.textContent = '●'.repeat(view.alive[0]);
      el.aliveB.textContent = '●'.repeat(view.alive[1]);
      el.objective.textContent = view.objective;
      el.chargeTag.style.visibility = view.hasCharge ? 'visible' : 'hidden';
      // Crosshair gap follows true spread in pixels.
      el.crosshair.style.setProperty('--gap', `${6 + view.spreadPx}px`);
      // Channel bar (plant / defuse)
      if (view.channel) {
        el.progressWrap.hidden = false;
        el.progressBar.style.width = `${Math.min(100, view.channel.k * 100)}%`;
        el.progressLabel.textContent = view.channel.label;
      } else {
        el.progressWrap.hidden = true;
      }
      // Damage vignette and flashbang white-out.
      el.vignette.style.opacity = String(view.hurtK);
      el.flashOverlay.style.opacity = String(view.blindK);
      el.scope.style.visibility = view.scoped ? 'visible' : 'hidden';
    },
    renderBuy(player, secondsLeft) {
      el.buyMoney.textContent = `$${player.money}`;
      el.buyTimer.textContent = `${Math.ceil(secondsLeft)}s`;
      const lo = player.loadout;
      el.buyItems.innerHTML = BUY_CATALOG.map((item, i) => {
        let owned = false;
        let note = '';
        if (item.kind === 'weapon') owned = lo.primary?.id === item.id;
        if (item.kind === 'armor') owned = lo.armor;
        if (item.kind === 'grenade') {
          const n = lo.grenades[item.id];
          note = n > 0 ? ` ×${n}` : '';
          owned = n >= GRENADES[item.id].max;
        }
        const afford = player.money >= item.price;
        const cls = owned ? 'owned' : afford ? '' : 'poor';
        return `<div class="buy-row ${cls}"><span class="buy-key">${i + 1}</span><span class="buy-label">${item.label}${note}</span><span class="buy-price">${owned && item.kind !== 'grenade' ? 'OWNED' : '$' + item.price}</span></div>`;
      }).join('');
    },
    showBuy(show) { el.buyMenu.hidden = !show; },
  };
}
