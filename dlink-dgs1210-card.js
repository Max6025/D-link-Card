/*
 * D-Link DGS-1210 Switch Cards for Home Assistant
 * A collection of custom Lovelace cards for visualizing data provided by a
 * DGS-1210 switch integration (link status, speed, traffic, PoE consumption).
 *
 * Every card supports a "theme" option (selectable per-card in the visual
 * editor): mushroom (default), vanilla, minimal, glass, or custom (exposes
 * its own radius/color fields in the editor, only shown once selected).
 *
 * Cards provided:
 *  - dlink-header-card           hero header for a switch dashboard/view
 *  - dlink-switch-card           full port table (all ports, all details)
 *  - dlink-ports-grid-card       compact chip row of all ports
 *  - dlink-port-card             detail card for a single port
 *  - dlink-poe-card              PoE power consumption card with usage bar
 *  - dlink-traffic-card          total traffic in/out across all ports
 *  - dlink-stats-card            gauges (port + PoE utilization) + traffic stats
 *  - dlink-switch-summary-card   glance-style summary of the whole switch
 *
 * Badges (add via a view's "Badges" section, not the card picker):
 *  - dlink-poe-badge             compact pill with PoE consumption
 *  - dlink-port-badge            compact pill with a single port's status
 *  - dlink-ports-badge           compact pill with connected-port count
 */

const CARD_VERSION = "3.1.0";

const DEFAULT_CONNECTED_STATES = ["on", "connected", "verbunden", "up", "true"];

const COLOR_RGB = {
  green: "76,175,80",
  grey: "158,158,158",
  blue: "3,169,244",
  teal: "0,150,136",
  orange: "255,112,67",
  amber: "255,152,0",
  red: "244,67,54",
};

function setIconColor(el, colorKey, colors) {
  const map = colors || COLOR_RGB;
  const rgb = map[colorKey] || map.blue || COLOR_RGB.blue;
  el.style.setProperty("--dlink-icon-bg", `rgba(${rgb}, 0.16)`);
  el.style.setProperty("--dlink-icon-color", `rgb(${rgb})`);
}

function fireMoreInfo(el, entityId) {
  if (!entityId) return;
  el.dispatchEvent(
    new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    })
  );
}

function formatState(hass, stateObj) {
  if (!stateObj) return "–";
  if (hass && typeof hass.formatEntityState === "function") {
    try {
      return hass.formatEntityState(stateObj);
    } catch (err) {
      /* fall through to basic formatting */
    }
  }
  const unit = stateObj.attributes && stateObj.attributes.unit_of_measurement;
  return unit ? `${stateObj.state} ${unit}` : stateObj.state;
}

function isConnectedState(stateObj, connectedStates) {
  if (!stateObj) return false;
  const list = (connectedStates || DEFAULT_CONNECTED_STATES).map((s) => String(s).toLowerCase());
  return list.includes(String(stateObj.state).toLowerCase());
}

function numericValue(stateObj) {
  if (!stateObj) return null;
  const n = parseFloat(stateObj.state);
  return Number.isNaN(n) ? null : n;
}

function numOr(value, fallback) {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function resolvePorts(config) {
  if (Array.isArray(config.ports) && config.ports.length) {
    return config.ports.map((p, i) => ({
      port: p.port != null ? p.port : i + 1,
      name: p.name || `Port ${p.port != null ? p.port : i + 1}`,
      link: p.link,
      speed: p.speed,
      traffic_in: p.traffic_in,
      traffic_out: p.traffic_out,
    }));
  }
  const count = config.port_count || 8;
  const tpl = config.entities || {};
  const ports = [];
  for (let i = 1; i <= count; i++) {
    ports.push({
      port: i,
      name: `Port ${i}`,
      link: tpl.link ? tpl.link.replace("{port}", i) : undefined,
      speed: tpl.speed ? tpl.speed.replace("{port}", i) : undefined,
      traffic_in: tpl.traffic_in ? tpl.traffic_in.replace("{port}", i) : undefined,
      traffic_out: tpl.traffic_out ? tpl.traffic_out.replace("{port}", i) : undefined,
    });
  }
  return ports;
}

function extractPortNumber(text) {
  if (!text) return null;
  const match = /port[\s_-]*(\d{1,2})\b/i.exec(text);
  return match ? parseInt(match[1], 10) : null;
}

function classifyEntitySignal(entityId, name) {
  const lower = `${name || ""} ${entityId}`.toLowerCase();
  const isBinary = entityId.startsWith("binary_sensor.");

  if (isBinary && (lower.includes("link") || lower.includes("verbind") || lower.includes("connect"))) {
    return "link";
  }
  if (lower.includes("speed") || lower.includes("geschwindigkeit")) {
    return "speed";
  }
  const isTraffic = lower.includes("traffic") || lower.includes("datenverkehr");
  if (
    isTraffic &&
    (lower.includes(" in") || lower.includes("eingehend") || lower.includes("empfangen") || lower.includes("rx") || lower.endsWith("_in"))
  ) {
    return "traffic_in";
  }
  if (
    isTraffic &&
    (lower.includes(" out") || lower.includes("ausgehend") || lower.includes("gesendet") || lower.includes("tx") || lower.endsWith("_out"))
  ) {
    return "traffic_out";
  }
  if (
    lower.includes("poe") &&
    (lower.includes("leistung") || lower.includes("power") || lower.includes("verbrauch") || lower.includes("consumption") || lower.includes("watt"))
  ) {
    return "poe";
  }
  return null;
}

function detectPortsFromDevice(hass, deviceId) {
  const result = { poe_entity: undefined, ports: {} };
  if (!hass || !hass.entities || !deviceId) return result;
  for (const entry of Object.values(hass.entities)) {
    if (entry.device_id !== deviceId) continue;
    const entityId = entry.entity_id;
    const stateObj = hass.states[entityId];
    const name =
      (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) ||
      entry.name ||
      entry.original_name ||
      entityId;
    const signal = classifyEntitySignal(entityId, name);
    if (!signal) continue;
    if (signal === "poe") {
      result.poe_entity = entityId;
      continue;
    }
    const portNum = extractPortNumber(name) || extractPortNumber(entityId);
    if (!portNum) continue;
    if (!result.ports[portNum]) result.ports[portNum] = {};
    result.ports[portNum][signal] = entityId;
  }
  return result;
}

function validatePortsConfig(config) {
  const hasExplicitPorts = Array.isArray(config.ports) && config.ports.length;
  const hasTemplate = config.entities && (config.entities.link || config.entities.speed);
  const hasPortCount = typeof config.port_count === "number" && config.port_count > 0;
  if (!hasExplicitPorts && !hasTemplate && !hasPortCount) {
    throw new Error(
      "Bitte 'port_count' angeben, oder 'ports' (Liste) bzw. 'entities' konfigurieren."
    );
  }
}

function sumPortTraffic(hass, ports) {
  let connectedCount = 0;
  let total = 0;
  let sumIn = 0;
  let sumOut = 0;
  let unitIn = "";
  let unitOut = "";

  for (const port of ports) {
    if (port.link) {
      total++;
      const stateObj = hass.states[port.link];
      if (stateObj && isConnectedState(stateObj)) connectedCount++;
    }
    if (port.traffic_in) {
      const s = hass.states[port.traffic_in];
      const v = numericValue(s);
      if (v != null) {
        sumIn += v;
        unitIn = (s.attributes && s.attributes.unit_of_measurement) || unitIn;
      }
    }
    if (port.traffic_out) {
      const s = hass.states[port.traffic_out];
      const v = numericValue(s);
      if (v != null) {
        sumOut += v;
        unitOut = (s.attributes && s.attributes.unit_of_measurement) || unitOut;
      }
    }
  }
  return { connectedCount, total, sumIn, sumOut, unitIn, unitOut };
}

/* ------------------------------------------------------------------ */
/* Theme system: every card resolves a "theme" (mushroom/vanilla/      */
/* minimal/glass/custom) into (a) an accent-color map (colors, changed */
/* only by "custom") and (b) a CSS string appended after the base      */
/* (mushroom) styles to restyle the shared building blocks.            */
/* ------------------------------------------------------------------ */
const THEME_OPTIONS = [
  { value: "mushroom", label: "Mushroom" },
  { value: "vanilla", label: "Vanilla (HA-Standard)" },
  { value: "minimal", label: "Minimal" },
  { value: "glass", label: "Glas" },
  { value: "custom", label: "Benutzerdefiniert" },
];

const THEME_OVERRIDE_CSS = {
  mushroom: "",
  vanilla: `
    ha-card { padding: 16px; }
    .dlink-icon-container, .dlink-icon-container-lg {
      background: transparent !important;
      border-radius: 0;
    }
    .dlink-icon-container ha-icon { --mdc-icon-size: 22px; }
    .dlink-icon-container-lg ha-icon { --mdc-icon-size: 26px; }
    .dlink-row {
      border-radius: 0;
      border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.15));
    }
    .dlink-row:hover { background-color: transparent; }
    .dlink-row:last-child { border-bottom: none; }
    .dlink-chip {
      border-radius: 8px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.08)) !important;
    }
    .dlink-chip-icon { background: transparent !important; border-radius: 0; }
  `,
  minimal: `
    ha-card { padding: 4px 6px; }
    .dlink-row { padding: 5px 6px; gap: 8px; }
    .dlink-icon-container, .dlink-icon-container-lg {
      width: 22px; height: 22px; border-radius: 0; background: transparent !important;
    }
    .dlink-icon-container ha-icon, .dlink-icon-container-lg ha-icon { --mdc-icon-size: 18px; }
    .dlink-primary { font-size: 0.82rem; }
    .dlink-secondary { font-size: 0.7rem; }
    .dlink-value { font-size: 0.8rem; }
    .dlink-port-heading { padding: 8px 6px 0 6px; }
    .dlink-chip { padding: 3px 8px 3px 3px; background: transparent !important; }
    .dlink-chip-icon { width: 18px; height: 18px; background: transparent !important; }
  `,
  glass: `
    ha-card { padding: 10px; border-radius: 18px; }
    .dlink-icon-container, .dlink-icon-container-lg {
      background: transparent !important;
      border: 2px solid var(--dlink-icon-color, currentColor);
    }
    .dlink-row { border-radius: 14px; }
    .dlink-chip {
      background: transparent !important;
      border: 1.5px solid var(--dlink-icon-color, currentColor);
    }
    .dlink-chip-icon { background: transparent !important; }
  `,
};

function customThemeCss(config) {
  const cardRadius = numOr(config.custom_card_radius, 12);
  const iconRadius = numOr(config.custom_icon_radius, 12);
  const filled = config.custom_icon_filled !== false;
  const outlineCss = filled
    ? ""
    : `
      .dlink-icon-container, .dlink-icon-container-lg {
        background: transparent !important;
        border: 2px solid var(--dlink-icon-color, currentColor);
      }
      .dlink-chip, .dlink-chip-icon { background: transparent !important; }
      .dlink-chip { border: 1.5px solid var(--dlink-icon-color, currentColor); }
    `;
  return `
    ha-card { border-radius: ${cardRadius}px; }
    .dlink-icon-container, .dlink-icon-container-lg { border-radius: ${iconRadius}px; }
    ${outlineCss}
  `;
}

function getThemeCss(config) {
  const theme = (config && config.theme) || "mushroom";
  if (theme === "custom") return customThemeCss(config || {});
  return THEME_OVERRIDE_CSS[theme] || "";
}

function rgbArrToStr(arr, fallback) {
  return Array.isArray(arr) && arr.length === 3 ? arr.map((n) => Math.round(n)).join(",") : fallback;
}

function getThemeColors(config) {
  if (!config || config.theme !== "custom") return COLOR_RGB;
  return {
    green: rgbArrToStr(config.custom_color_connected, COLOR_RGB.green),
    grey: rgbArrToStr(config.custom_color_disconnected, COLOR_RGB.grey),
    blue: rgbArrToStr(config.custom_color_info, COLOR_RGB.blue),
    teal: rgbArrToStr(config.custom_color_download, COLOR_RGB.teal),
    orange: rgbArrToStr(config.custom_color_upload, COLOR_RGB.orange),
    amber: rgbArrToStr(config.custom_color_warning, COLOR_RGB.amber),
    red: rgbArrToStr(config.custom_color_critical, COLOR_RGB.red),
  };
}

function themeSchemaFields(config) {
  const fields = [{ name: "theme", selector: { select: { mode: "dropdown", options: THEME_OPTIONS } } }];
  if ((config || {}).theme === "custom") {
    fields.push(
      { name: "custom_card_radius", selector: { number: { mode: "slider", min: 0, max: 28, step: 1 } } },
      { name: "custom_icon_radius", selector: { number: { mode: "slider", min: 0, max: 24, step: 1 } } },
      { name: "custom_icon_filled", selector: { boolean: {} } },
      { name: "custom_color_connected", selector: { color_rgb: {} } },
      { name: "custom_color_disconnected", selector: { color_rgb: {} } },
      { name: "custom_color_info", selector: { color_rgb: {} } },
      { name: "custom_color_download", selector: { color_rgb: {} } },
      { name: "custom_color_upload", selector: { color_rgb: {} } },
      { name: "custom_color_warning", selector: { color_rgb: {} } },
      { name: "custom_color_critical", selector: { color_rgb: {} } }
    );
  }
  return fields;
}

const THEME_LABELS = {
  theme: "Design",
  custom_card_radius: "Eckenradius Karte (px)",
  custom_icon_radius: "Eckenradius Icon (px)",
  custom_icon_filled: "Icon-Hintergrund gefüllt",
  custom_color_connected: "Farbe: Verbunden",
  custom_color_disconnected: "Farbe: Getrennt",
  custom_color_info: "Farbe: Speed / Info",
  custom_color_download: "Farbe: Traffic ein",
  custom_color_upload: "Farbe: Traffic aus",
  custom_color_warning: "Farbe: Warnung",
  custom_color_critical: "Farbe: Kritisch",
};

const THEME_HELPERS = {
  theme: 'Bestimmt Form und Farben der Icons. "Benutzerdefiniert" schaltet eigene Einstellungen darunter frei.',
};

/* ------------------------------------------------------------------ */
/* Shared "mushroom-ish" building blocks: rounded card, icon container */
/* with a tinted accent color, primary/secondary text line, soft hover,*/
/* and a simple SVG ring gauge (no dependency on lazily-loaded ha-gauge)*/
/* ------------------------------------------------------------------ */
const SHARED_STYLES = `
  ha-card {
    padding: 8px;
    border-radius: var(--ha-card-border-radius, 12px);
  }
  .dlink-title {
    font-size: 1rem;
    font-weight: 500;
    color: var(--primary-text-color);
    padding: 6px 10px 8px 10px;
  }
  .dlink-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 12px;
    cursor: pointer;
    transition: background-color 180ms ease-in-out;
  }
  .dlink-row:hover {
    background-color: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.05);
  }
  .dlink-icon-container {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--dlink-icon-bg, rgba(68, 115, 158, 0.16));
    color: var(--dlink-icon-color, #44739e);
  }
  .dlink-icon-container ha-icon {
    --mdc-icon-size: 20px;
    color: inherit;
  }
  .dlink-icon-container-lg {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--dlink-icon-bg, rgba(68, 115, 158, 0.16));
    color: var(--dlink-icon-color, #44739e);
  }
  .dlink-icon-container-lg ha-icon {
    --mdc-icon-size: 28px;
    color: inherit;
  }
  .dlink-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .dlink-primary {
    font-size: 0.92rem;
    font-weight: 500;
    color: var(--primary-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dlink-secondary {
    font-size: 0.78rem;
    color: var(--secondary-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dlink-secondary:empty {
    display: none;
  }
  .dlink-value {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--primary-text-color);
    text-align: right;
    flex-shrink: 0;
    padding-left: 8px;
  }
  .dlink-port-heading {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--secondary-text-color);
    padding: 14px 10px 2px 10px;
  }
  .dlink-port-heading:first-of-type {
    padding-top: 6px;
  }
  .dlink-gauge {
    position: relative;
    display: inline-flex;
  }
  .dlink-gauge-track {
    stroke: var(--divider-color, rgba(127, 127, 127, 0.2));
  }
  .dlink-gauge-value {
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s ease, stroke 0.4s ease;
  }
  .dlink-gauge-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.1;
  }
  .dlink-gauge-value-text {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--primary-text-color);
  }
  .dlink-gauge-label-text {
    font-size: 0.6rem;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .dlink-stats-gauges {
    display: flex;
    justify-content: center;
    gap: 24px;
    padding: 8px 10px 4px 10px;
  }
  .dlink-stats-gauge-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .dlink-stats-gauge-caption {
    font-size: 0.75rem;
    color: var(--secondary-text-color);
  }
  .dlink-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 6px;
    border-radius: 999px;
    background: var(--dlink-icon-bg, rgba(158, 158, 158, 0.16));
    cursor: pointer;
    transition: filter 150ms ease-in-out;
  }
  .dlink-chip:hover {
    filter: brightness(0.96);
  }
  .dlink-chip-icon {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.4);
    color: var(--dlink-icon-color, #616161);
    flex-shrink: 0;
  }
  .dlink-chip-icon ha-icon {
    --mdc-icon-size: 16px;
    color: inherit;
  }
  .dlink-chip-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .dlink-chip-port {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--dlink-icon-color, #616161);
  }
  .dlink-chip-speed {
    font-size: 0.72rem;
    color: var(--primary-text-color);
    min-height: 1em;
  }
  .dlink-badge-chip {
    padding: 4px 12px 4px 4px;
  }
  .dlink-badge-chip .dlink-chip-icon {
    width: 22px;
    height: 22px;
  }
  .dlink-badge-text {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--primary-text-color);
    white-space: nowrap;
  }
`;

function createInfoRow(icon, colorKey, colors) {
  const row = document.createElement("div");
  row.className = "dlink-row";
  row.innerHTML = `
    <div class="dlink-icon-container">
      <ha-icon></ha-icon>
    </div>
    <div class="dlink-info">
      <span class="dlink-primary"></span>
      <span class="dlink-secondary"></span>
    </div>
    <span class="dlink-value"></span>
  `;
  const iconContainer = row.querySelector(".dlink-icon-container");
  const iconEl = row.querySelector("ha-icon");
  iconEl.icon = icon;
  setIconColor(iconContainer, colorKey || "blue", colors);
  const primaryEl = row.querySelector(".dlink-primary");
  const secondaryEl = row.querySelector(".dlink-secondary");
  const valueEl = row.querySelector(".dlink-value");
  return { row, iconContainer, iconEl, primaryEl, secondaryEl, valueEl };
}

function updateLinkRow(hass, entry, connectedStates, colors) {
  const { entity, iconEl, iconContainer, valueEl } = entry;
  const stateObj = hass.states[entity];
  if (!stateObj) {
    valueEl.textContent = "nicht gefunden";
    iconEl.icon = "mdi:help-circle-outline";
    setIconColor(iconContainer, "grey", colors);
    return;
  }
  const connected = isConnectedState(stateObj, connectedStates);
  valueEl.textContent = formatState(hass, stateObj);
  iconEl.icon = connected ? "mdi:lan-connect" : "mdi:lan-disconnect";
  setIconColor(iconContainer, connected ? "green" : "grey", colors);
}

function updateValueRow(hass, entry, icon, colorKey, colors) {
  const { entity, iconEl, iconContainer, valueEl } = entry;
  const stateObj = hass.states[entity];
  if (!stateObj) {
    valueEl.textContent = "nicht gefunden";
    setIconColor(iconContainer, "grey", colors);
    return;
  }
  valueEl.textContent = formatState(hass, stateObj);
  iconEl.icon = icon;
  setIconColor(iconContainer, colorKey || "blue", colors);
}

function createGauge(size, strokeWidth) {
  const s = size || 88;
  const sw = strokeWidth || 8;
  const radius = (s - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const wrap = document.createElement("div");
  wrap.className = "dlink-gauge";
  wrap.style.width = `${s}px`;
  wrap.style.height = `${s}px`;
  wrap.innerHTML = `
    <svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
      <circle class="dlink-gauge-track" cx="${s / 2}" cy="${s / 2}" r="${radius}" stroke-width="${sw}" fill="none"></circle>
      <circle class="dlink-gauge-value" cx="${s / 2}" cy="${s / 2}" r="${radius}" stroke-width="${sw}" fill="none"
        stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"
        transform="rotate(-90 ${s / 2} ${s / 2})"></circle>
    </svg>
    <div class="dlink-gauge-center">
      <span class="dlink-gauge-value-text"></span>
      <span class="dlink-gauge-label-text"></span>
    </div>
  `;
  const valueCircle = wrap.querySelector(".dlink-gauge-value");
  const valueTextEl = wrap.querySelector(".dlink-gauge-value-text");
  const labelTextEl = wrap.querySelector(".dlink-gauge-label-text");
  return {
    el: wrap,
    setPercent(percent, colorRgb) {
      const clamped = Math.max(0, Math.min(100, percent || 0));
      const offset = circumference - (clamped / 100) * circumference;
      valueCircle.style.strokeDashoffset = String(offset);
      if (colorRgb) valueCircle.style.stroke = `rgb(${colorRgb})`;
    },
    setText(value, label) {
      valueTextEl.textContent = value;
      labelTextEl.textContent = label || "";
    },
  };
}

function createBadgeChip(icon, colorKey, colors) {
  const el = document.createElement("div");
  el.className = "dlink-chip dlink-badge-chip";
  el.innerHTML = `
    <span class="dlink-chip-icon"><ha-icon></ha-icon></span>
    <span class="dlink-badge-text"></span>
  `;
  const iconEl = el.querySelector("ha-icon");
  iconEl.icon = icon;
  setIconColor(el, colorKey || "blue", colors);
  const textEl = el.querySelector(".dlink-badge-text");
  return { el, iconEl, textEl };
}

/* ------------------------------------------------------------------ */
/* dlink-header-card - hero header for a switch dashboard/view         */
/* ------------------------------------------------------------------ */
class DlinkHeaderCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const connectedStates = this._config.connected_states;
    let connectedCount = 0;
    let total = 0;
    for (const port of this._ports) {
      if (!port.link) continue;
      total++;
      const stateObj = hass.states[port.link];
      if (stateObj && isConnectedState(stateObj, connectedStates)) connectedCount++;
    }

    let colorKey = total === 0 ? "grey" : connectedCount === total ? "green" : connectedCount === 0 ? "red" : "amber";

    let subtitle = total ? `${connectedCount}/${total} Ports verbunden` : "";
    if (this._config.poe_entity) {
      const stateObj = hass.states[this._config.poe_entity];
      if (stateObj) {
        subtitle += (subtitle ? " · " : "") + `${formatState(hass, stateObj)} PoE`;
        const maxPower = this._config.max_power;
        const value = numericValue(stateObj);
        if (maxPower && value != null) {
          const percent = (value / maxPower) * 100;
          const warn = this._config.warn_percent != null ? this._config.warn_percent : 70;
          const critical = this._config.critical_percent != null ? this._config.critical_percent : 90;
          if (percent >= critical) colorKey = "red";
          else if (percent >= warn && colorKey !== "red") colorKey = "amber";
        }
      }
    }

    this._subtitleEl.textContent = subtitle;
    setIconColor(this._iconContainer, colorKey, this._colors);
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      ha-card {
        padding: 14px;
      }
      .dlink-header-row {
        display: flex;
        align-items: center;
        gap: 14px;
        cursor: ${this._config.poe_entity ? "pointer" : "default"};
      }
      .dlink-header-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .dlink-header-title {
        font-size: 1.1rem;
        font-weight: 500;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dlink-header-subtitle {
        font-size: 0.82rem;
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      ${getThemeCss(this._config)}
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    const row = document.createElement("div");
    row.className = "dlink-header-row";
    row.innerHTML = `
      <div class="dlink-icon-container-lg"><ha-icon icon="${this._config.icon || "mdi:server-network"}"></ha-icon></div>
      <div class="dlink-header-text">
        <span class="dlink-header-title"></span>
        <span class="dlink-header-subtitle"></span>
      </div>
    `;
    if (this._config.poe_entity) {
      row.addEventListener("click", () => fireMoreInfo(this, this._config.poe_entity));
    }
    card.appendChild(row);

    this._iconContainer = row.querySelector(".dlink-icon-container-lg");
    row.querySelector(".dlink-header-title").textContent = this._config.title || "DGS-1210";
    this._subtitleEl = row.querySelector(".dlink-header-subtitle");

    setIconColor(this._iconContainer, "grey", this._colors);
  }

  getCardSize() {
    return 1;
  }

  static getStubConfig() {
    return { title: "DGS-1210", port_count: 8 };
  }

  static getConfigElement() {
    return document.createElement("dlink-header-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-switch-card - full port table                                 */
/* ------------------------------------------------------------------ */
class DlinkSwitchCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rows) return;
    const connectedStates = this._config.connected_states;
    if (this._poeRow) {
      updateValueRow(hass, this._poeRow, "mdi:flash", "amber", this._colors);
    }
    for (const entry of this._rows) {
      if (entry.kind === "link") updateLinkRow(hass, entry, connectedStates, this._colors);
      else if (entry.kind === "speed") updateValueRow(hass, entry, "mdi:speedometer", "blue", this._colors);
      else if (entry.kind === "traffic_in") updateValueRow(hass, entry, "mdi:download-network-outline", "teal", this._colors);
      else if (entry.kind === "traffic_out") updateValueRow(hass, entry, "mdi:upload-network-outline", "orange", this._colors);
    }
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES + getThemeCss(this._config);
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "dlink-title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    this._rows = [];
    this._poeRow = null;

    if (this._config.poe_entity && this._config.show_poe !== false) {
      const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:flash", "amber", this._colors);
      primaryEl.textContent = "PoE-Leistungsverbrauch";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.poe_entity));
      card.appendChild(row);
      this._poeRow = { entity: this._config.poe_entity, iconEl, iconContainer, valueEl };
    }

    const compact = !!this._config.compact;

    for (const port of this._ports) {
      const heading = document.createElement("div");
      heading.className = "dlink-port-heading";
      heading.textContent = port.name;
      card.appendChild(heading);

      if (port.link) {
        const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:lan-connect", "grey", this._colors);
        primaryEl.textContent = "Link";
        row.addEventListener("click", () => fireMoreInfo(this, port.link));
        card.appendChild(row);
        this._rows.push({ entity: port.link, kind: "link", iconEl, iconContainer, valueEl });
      }
      if (port.speed) {
        const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:speedometer", "blue", this._colors);
        primaryEl.textContent = "Speed";
        row.addEventListener("click", () => fireMoreInfo(this, port.speed));
        card.appendChild(row);
        this._rows.push({ entity: port.speed, kind: "speed", iconEl, iconContainer, valueEl });
      }
      if (!compact && port.traffic_in) {
        const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:download-network-outline", "teal", this._colors);
        primaryEl.textContent = "Traffic ein";
        row.addEventListener("click", () => fireMoreInfo(this, port.traffic_in));
        card.appendChild(row);
        this._rows.push({ entity: port.traffic_in, kind: "traffic_in", iconEl, iconContainer, valueEl });
      }
      if (!compact && port.traffic_out) {
        const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:upload-network-outline", "orange", this._colors);
        primaryEl.textContent = "Traffic aus";
        row.addEventListener("click", () => fireMoreInfo(this, port.traffic_out));
        card.appendChild(row);
        this._rows.push({ entity: port.traffic_out, kind: "traffic_out", iconEl, iconContainer, valueEl });
      }
    }
  }

  getCardSize() {
    const rowsPerPort = this._config && this._config.compact ? 2 : 4;
    return 1 + (this._ports ? this._ports.length * rowsPerPort : 0) / 3;
  }

  static getStubConfig() {
    return { title: "DGS-1210", port_count: 8 };
  }

  static getConfigElement() {
    return document.createElement("dlink-switch-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-ports-grid-card - compact chip row of all ports                */
/* ------------------------------------------------------------------ */
class DlinkPortsGridCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._chips) return;
    const connectedStates = this._config.connected_states;
    for (const chip of this._chips) {
      const linkState = chip.link ? hass.states[chip.link] : null;
      const speedState = chip.speed ? hass.states[chip.speed] : null;
      const connected = linkState ? isConnectedState(linkState, connectedStates) : null;

      setIconColor(chip.el, connected ? "green" : "grey", this._colors);
      chip.iconEl.icon = connected ? "mdi:lan-connect" : "mdi:lan-disconnect";
      chip.speedEl.textContent = speedState ? formatState(hass, speedState) : "";
    }
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      .dlink-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 6px;
      }
      ${getThemeCss(this._config)}
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "dlink-title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const grid = document.createElement("div");
    grid.className = "dlink-grid";
    card.appendChild(grid);

    this._chips = [];
    for (const port of this._ports) {
      const chip = document.createElement("div");
      chip.className = "dlink-chip";
      chip.innerHTML = `
        <span class="dlink-chip-icon"><ha-icon></ha-icon></span>
        <span class="dlink-chip-text">
          <span class="dlink-chip-port">P${port.port}</span>
          <span class="dlink-chip-speed"></span>
        </span>
      `;
      chip.addEventListener("click", () => fireMoreInfo(this, port.link || port.speed));
      grid.appendChild(chip);
      this._chips.push({
        link: port.link,
        speed: port.speed,
        el: chip,
        iconEl: chip.querySelector("ha-icon"),
        speedEl: chip.querySelector(".dlink-chip-speed"),
      });
    }
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig(hass) {
    return DlinkSwitchCard.getStubConfig(hass);
  }

  static getConfigElement() {
    return document.createElement("dlink-ports-grid-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-port-card - single port detail card                           */
/* ------------------------------------------------------------------ */
class DlinkPortCard extends HTMLElement {
  setConfig(config) {
    if (!config.link && !config.speed && !config.traffic_in && !config.traffic_out) {
      throw new Error("Bitte mindestens eine Entität (link, speed, traffic_in oder traffic_out) angeben.");
    }
    this._config = config;
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const connectedStates = this._config.connected_states;
    if (this._linkEntry) updateLinkRow(hass, this._linkEntry, connectedStates, this._colors);
    if (this._speedEntry) updateValueRow(hass, this._speedEntry, "mdi:speedometer", "blue", this._colors);
    if (this._inEntry) updateValueRow(hass, this._inEntry, "mdi:download-network-outline", "teal", this._colors);
    if (this._outEntry) updateValueRow(hass, this._outEntry, "mdi:upload-network-outline", "orange", this._colors);
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES + getThemeCss(this._config);
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    const title = document.createElement("div");
    title.className = "dlink-title";
    title.textContent = this._config.name || "Port";
    card.appendChild(title);

    this._linkEntry = null;
    this._speedEntry = null;
    this._inEntry = null;
    this._outEntry = null;

    if (this._config.link) {
      const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:lan-connect", "grey", this._colors);
      primaryEl.textContent = "Verbindung";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.link));
      card.appendChild(row);
      this._linkEntry = { entity: this._config.link, iconEl, iconContainer, valueEl };
    }
    if (this._config.speed) {
      const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:speedometer", "blue", this._colors);
      primaryEl.textContent = "Geschwindigkeit";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.speed));
      card.appendChild(row);
      this._speedEntry = { entity: this._config.speed, iconEl, iconContainer, valueEl };
    }
    if (this._config.traffic_in) {
      const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:download-network-outline", "teal", this._colors);
      primaryEl.textContent = "Traffic eingehend";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.traffic_in));
      card.appendChild(row);
      this._inEntry = { entity: this._config.traffic_in, iconEl, iconContainer, valueEl };
    }
    if (this._config.traffic_out) {
      const { row, iconEl, iconContainer, primaryEl, valueEl } = createInfoRow("mdi:upload-network-outline", "orange", this._colors);
      primaryEl.textContent = "Traffic ausgehend";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.traffic_out));
      card.appendChild(row);
      this._outEntry = { entity: this._config.traffic_out, iconEl, iconContainer, valueEl };
    }
  }

  getCardSize() {
    return 3;
  }

  static getStubConfig() {
    return {
      name: "Port 1",
      link: "binary_sensor.dgs1210_port_1_link",
      speed: "sensor.dgs1210_port_1_speed",
      traffic_in: "sensor.dgs1210_port_1_traffic_in",
      traffic_out: "sensor.dgs1210_port_1_traffic_out",
    };
  }

  static getConfigElement() {
    return document.createElement("dlink-port-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-poe-card - PoE consumption card with usage bar                */
/* ------------------------------------------------------------------ */
class DlinkPoeCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) {
      throw new Error("Bitte 'entity' (PoE-Leistungssensor) angeben.");
    }
    this._config = config;
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (!stateObj) {
      this._valueEl.textContent = "nicht gefunden";
      setIconColor(this._iconContainer, "grey", this._colors);
      return;
    }
    const value = numericValue(stateObj);
    const unit = stateObj.attributes.unit_of_measurement || "W";
    this._valueEl.textContent = value != null ? `${formatState(hass, stateObj)}` : stateObj.state;

    const maxPower = this._config.max_power;
    let colorKey = "amber";
    if (maxPower && value != null) {
      const percent = Math.max(0, Math.min(100, (value / maxPower) * 100));
      const warn = this._config.warn_percent != null ? this._config.warn_percent : 70;
      const critical = this._config.critical_percent != null ? this._config.critical_percent : 90;
      colorKey = "green";
      if (percent >= critical) colorKey = "red";
      else if (percent >= warn) colorKey = "amber";
      this._barFill.style.width = `${percent}%`;
      this._barFill.style.background = `rgb(${this._colors[colorKey]})`;
      this._barWrap.style.display = "block";
      this._percentEl.textContent = `${percent.toFixed(0)}% von ${maxPower} ${unit}`;
    } else {
      this._barWrap.style.display = "none";
      this._percentEl.textContent = "";
    }
    setIconColor(this._iconContainer, colorKey, this._colors);
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      ha-card {
        padding: 14px;
        cursor: pointer;
      }
      .dlink-poe-row {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .dlink-poe-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .dlink-poe-name {
        font-size: 0.85rem;
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dlink-poe-value {
        font-size: 1.6rem;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .dlink-poe-bar-wrap {
        margin-top: 14px;
        height: 8px;
        border-radius: 4px;
        background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
        overflow: hidden;
      }
      .dlink-poe-bar-fill {
        height: 100%;
        width: 0%;
        border-radius: 4px;
        transition: width 0.4s ease, background 0.4s ease;
      }
      .dlink-poe-percent {
        margin-top: 6px;
        font-size: 0.78rem;
        color: var(--secondary-text-color);
      }
      ${getThemeCss(this._config)}
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    card.addEventListener("click", () => fireMoreInfo(this, this._config.entity));
    root.appendChild(card);

    const row = document.createElement("div");
    row.className = "dlink-poe-row";
    row.innerHTML = `
      <div class="dlink-icon-container-lg"><ha-icon icon="mdi:flash"></ha-icon></div>
      <div class="dlink-poe-text">
        <span class="dlink-poe-name"></span>
        <span class="dlink-poe-value"></span>
      </div>
    `;
    card.appendChild(row);
    this._iconContainer = row.querySelector(".dlink-icon-container-lg");
    row.querySelector(".dlink-poe-name").textContent = this._config.name || "PoE-Leistungsverbrauch";
    this._valueEl = row.querySelector(".dlink-poe-value");

    this._barWrap = document.createElement("div");
    this._barWrap.className = "dlink-poe-bar-wrap";
    this._barFill = document.createElement("div");
    this._barFill.className = "dlink-poe-bar-fill";
    this._barWrap.appendChild(this._barFill);
    card.appendChild(this._barWrap);

    this._percentEl = document.createElement("div");
    this._percentEl.className = "dlink-poe-percent";
    card.appendChild(this._percentEl);

    setIconColor(this._iconContainer, "amber", this._colors);
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig() {
    return {
      name: "PoE-Leistungsverbrauch",
      entity: "sensor.dgs1210_poe_power",
      max_power: 78,
    };
  }

  static getConfigElement() {
    return document.createElement("dlink-poe-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-traffic-card - total traffic in/out across all ports          */
/* ------------------------------------------------------------------ */
class DlinkTrafficCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const { sumIn, sumOut, unitIn, unitOut } = sumPortTraffic(hass, this._ports);
    this._inValueEl.textContent = `${sumIn.toFixed(2)} ${unitIn}`.trim();
    this._outValueEl.textContent = `${sumOut.toFixed(2)} ${unitOut}`.trim();
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      ha-card {
        padding: 14px;
      }
      .dlink-traffic-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        padding-top: 4px;
      }
      .dlink-traffic-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        text-align: center;
      }
      .dlink-traffic-value {
        font-size: 1.15rem;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .dlink-traffic-label {
        font-size: 0.75rem;
        color: var(--secondary-text-color);
      }
      ${getThemeCss(this._config)}
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "dlink-title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const grid = document.createElement("div");
    grid.className = "dlink-traffic-grid";
    grid.innerHTML = `
      <div class="dlink-traffic-col">
        <div class="dlink-icon-container-lg"><ha-icon icon="mdi:download-network-outline"></ha-icon></div>
        <span class="dlink-traffic-value"></span>
        <span class="dlink-traffic-label">Eingehend gesamt</span>
      </div>
      <div class="dlink-traffic-col">
        <div class="dlink-icon-container-lg"><ha-icon icon="mdi:upload-network-outline"></ha-icon></div>
        <span class="dlink-traffic-value"></span>
        <span class="dlink-traffic-label">Ausgehend gesamt</span>
      </div>
    `;
    card.appendChild(grid);

    const [inCol, outCol] = grid.querySelectorAll(".dlink-traffic-col");
    setIconColor(inCol.querySelector(".dlink-icon-container-lg"), "teal", this._colors);
    setIconColor(outCol.querySelector(".dlink-icon-container-lg"), "orange", this._colors);
    this._inValueEl = inCol.querySelector(".dlink-traffic-value");
    this._outValueEl = outCol.querySelector(".dlink-traffic-value");
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig() {
    return { title: "DGS-1210 Traffic", port_count: 8 };
  }

  static getConfigElement() {
    return document.createElement("dlink-traffic-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-stats-card - gauges (port + PoE utilization) + traffic stats  */
/* ------------------------------------------------------------------ */
class DlinkStatsCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const { connectedCount, total, sumIn, sumOut, unitIn, unitOut } = sumPortTraffic(hass, this._ports);

    const portPercent = total ? (connectedCount / total) * 100 : 0;
    const portColorKey = total === 0 ? "grey" : connectedCount === total ? "green" : connectedCount === 0 ? "red" : "amber";
    this._portsGauge.setPercent(portPercent, this._colors[portColorKey] || this._colors.blue);
    this._portsGauge.setText(`${connectedCount}/${total}`, "Ports");

    if (this._poeGauge && this._config.poe_entity) {
      const stateObj = hass.states[this._config.poe_entity];
      const value = numericValue(stateObj);
      const maxPower = this._config.max_power;
      if (stateObj && maxPower && value != null) {
        const percent = Math.max(0, Math.min(100, (value / maxPower) * 100));
        const warn = this._config.warn_percent != null ? this._config.warn_percent : 70;
        const critical = this._config.critical_percent != null ? this._config.critical_percent : 90;
        let colorKey = "green";
        if (percent >= critical) colorKey = "red";
        else if (percent >= warn) colorKey = "amber";
        this._poeGauge.setPercent(percent, this._colors[colorKey]);
        this._poeGauge.setText(formatState(hass, stateObj), "PoE");
      }
    }

    if (this._poeRow) {
      updateValueRow(hass, this._poeRow, "mdi:flash", "amber", this._colors);
    }

    this._inValueEl.textContent = `${sumIn.toFixed(2)} ${unitIn}`.trim();
    this._outValueEl.textContent = `${sumOut.toFixed(2)} ${unitOut}`.trim();
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      ha-card { padding: 12px; }
      ${getThemeCss(this._config)}
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "dlink-title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const gaugesWrap = document.createElement("div");
    gaugesWrap.className = "dlink-stats-gauges";
    card.appendChild(gaugesWrap);

    const portsCol = document.createElement("div");
    portsCol.className = "dlink-stats-gauge-col";
    this._portsGauge = createGauge(84, 8);
    portsCol.appendChild(this._portsGauge.el);
    const portsCaption = document.createElement("span");
    portsCaption.className = "dlink-stats-gauge-caption";
    portsCaption.textContent = "Portauslastung";
    portsCol.appendChild(portsCaption);
    gaugesWrap.appendChild(portsCol);

    if (this._config.poe_entity && this._config.max_power) {
      const poeCol = document.createElement("div");
      poeCol.className = "dlink-stats-gauge-col";
      this._poeGauge = createGauge(84, 8);
      poeCol.appendChild(this._poeGauge.el);
      const poeCaption = document.createElement("span");
      poeCaption.className = "dlink-stats-gauge-caption";
      poeCaption.textContent = "PoE-Auslastung";
      poeCol.appendChild(poeCaption);
      gaugesWrap.appendChild(poeCol);
    }

    const inRow = createInfoRow("mdi:download-network-outline", "teal", this._colors);
    inRow.primaryEl.textContent = "Traffic ein gesamt";
    card.appendChild(inRow.row);
    this._inValueEl = inRow.valueEl;

    const outRow = createInfoRow("mdi:upload-network-outline", "orange", this._colors);
    outRow.primaryEl.textContent = "Traffic aus gesamt";
    card.appendChild(outRow.row);
    this._outValueEl = outRow.valueEl;

    this._poeRow = null;
    if (this._config.poe_entity && !this._config.max_power) {
      const poeRow = createInfoRow("mdi:flash", "amber", this._colors);
      poeRow.primaryEl.textContent = "PoE-Leistungsverbrauch";
      poeRow.row.addEventListener("click", () => fireMoreInfo(this, this._config.poe_entity));
      card.appendChild(poeRow.row);
      this._poeRow = {
        entity: this._config.poe_entity,
        iconEl: poeRow.iconEl,
        iconContainer: poeRow.iconContainer,
        valueEl: poeRow.valueEl,
      };
    }
  }

  getCardSize() {
    return 3;
  }

  static getStubConfig() {
    return { title: "DGS-1210 Statistik", port_count: 8 };
  }

  static getConfigElement() {
    return document.createElement("dlink-stats-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-switch-summary-card - glance-style overview                   */
/* ------------------------------------------------------------------ */
class DlinkSwitchSummaryCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const connectedStates = this._config.connected_states;
    let connectedCount = 0;
    let total = 0;
    let sumIn = 0;
    let sumOut = 0;
    let unitIn = "";
    let unitOut = "";

    for (const port of this._ports) {
      if (!port.link) continue;
      total++;
      const stateObj = hass.states[port.link];
      if (stateObj && isConnectedState(stateObj, connectedStates)) connectedCount++;

      if (port.traffic_in) {
        const s = hass.states[port.traffic_in];
        const v = numericValue(s);
        if (v != null) {
          sumIn += v;
          unitIn = (s.attributes && s.attributes.unit_of_measurement) || unitIn;
        }
      }
      if (port.traffic_out) {
        const s = hass.states[port.traffic_out];
        const v = numericValue(s);
        if (v != null) {
          sumOut += v;
          unitOut = (s.attributes && s.attributes.unit_of_measurement) || unitOut;
        }
      }
    }

    this._portsValueEl.textContent = `${connectedCount}/${total}`;
    setIconColor(
      this._portsIconContainer,
      total === 0 ? "grey" : connectedCount === total ? "green" : connectedCount === 0 ? "red" : "amber",
      this._colors
    );

    this._inValueEl.textContent = `${sumIn.toFixed(2)} ${unitIn}`.trim();
    this._outValueEl.textContent = `${sumOut.toFixed(2)} ${unitOut}`.trim();

    if (this._config.poe_entity) {
      const stateObj = hass.states[this._config.poe_entity];
      this._poeValueEl.textContent = stateObj ? formatState(hass, stateObj) : "nicht gefunden";
    }
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      ha-card {
        padding: 14px;
      }
      .dlink-summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
        gap: 10px;
      }
      .dlink-summary-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 6px 4px;
        border-radius: 12px;
        cursor: pointer;
        transition: background-color 180ms ease-in-out;
      }
      .dlink-summary-tile:hover {
        background-color: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.05);
      }
      .dlink-summary-value {
        font-size: 1rem;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .dlink-summary-label {
        font-size: 0.72rem;
        color: var(--secondary-text-color);
        text-align: center;
      }
      ${getThemeCss(this._config)}
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "dlink-title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const grid = document.createElement("div");
    grid.className = "dlink-summary-grid";
    card.appendChild(grid);

    const makeTile = (icon, label) => {
      const tile = document.createElement("div");
      tile.className = "dlink-summary-tile";
      tile.innerHTML = `
        <div class="dlink-icon-container"><ha-icon icon="${icon}"></ha-icon></div>
        <span class="dlink-summary-value"></span>
        <span class="dlink-summary-label">${label}</span>
      `;
      grid.appendChild(tile);
      return tile;
    };

    const portsTile = makeTile("mdi:lan-connect", "Ports verbunden");
    this._portsIconContainer = portsTile.querySelector(".dlink-icon-container");
    this._portsValueEl = portsTile.querySelector(".dlink-summary-value");

    const inTile = makeTile("mdi:download-network-outline", "Traffic ein");
    setIconColor(inTile.querySelector(".dlink-icon-container"), "teal", this._colors);
    this._inValueEl = inTile.querySelector(".dlink-summary-value");

    const outTile = makeTile("mdi:upload-network-outline", "Traffic aus");
    setIconColor(outTile.querySelector(".dlink-icon-container"), "orange", this._colors);
    this._outValueEl = outTile.querySelector(".dlink-summary-value");

    if (this._config.poe_entity) {
      const poeTile = makeTile("mdi:flash", "PoE");
      setIconColor(poeTile.querySelector(".dlink-icon-container"), "amber", this._colors);
      poeTile.addEventListener("click", () => fireMoreInfo(this, this._config.poe_entity));
      this._poeValueEl = poeTile.querySelector(".dlink-summary-value");
    }
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig() {
    return { title: "DGS-1210", port_count: 8 };
  }

  static getConfigElement() {
    return document.createElement("dlink-switch-summary-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* Badges - small pills for the badge row at the top of a dashboard    */
/* view (Einstellungen eines Views -> Badges). Same setConfig/hass/    */
/* getConfigElement/getStubConfig contract as cards, registered via    */
/* window.customBadges instead of window.customCards.                 */
/* ------------------------------------------------------------------ */
class DlinkPoeBadge extends HTMLElement {
  setConfig(config) {
    if (!config.entity) {
      throw new Error("Bitte 'entity' (PoE-Leistungssensor) angeben.");
    }
    this._config = config;
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (!stateObj) {
      this._textEl.textContent = this._config.name || "PoE: n/a";
      setIconColor(this._chip.el, "grey", this._colors);
      return;
    }
    const value = numericValue(stateObj);
    const maxPower = this._config.max_power;
    let colorKey = "amber";
    if (maxPower && value != null) {
      const percent = Math.max(0, Math.min(100, (value / maxPower) * 100));
      const warn = this._config.warn_percent != null ? this._config.warn_percent : 70;
      const critical = this._config.critical_percent != null ? this._config.critical_percent : 90;
      colorKey = "green";
      if (percent >= critical) colorKey = "red";
      else if (percent >= warn) colorKey = "amber";
    }
    const prefix = this._config.name ? `${this._config.name}: ` : "";
    this._textEl.textContent = `${prefix}${formatState(hass, stateObj)}`;
    setIconColor(this._chip.el, colorKey, this._colors);
  }

  _buildDom() {
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES + getThemeCss(this._config);
    root.appendChild(style);
    this._chip = createBadgeChip("mdi:flash", "amber", this._colors);
    this._chip.el.addEventListener("click", () => fireMoreInfo(this, this._config.entity));
    this._textEl = this._chip.textEl;
    root.appendChild(this._chip.el);
  }

  static getStubConfig() {
    return { entity: "sensor.dgs1210_poe_power", max_power: 78 };
  }

  static getConfigElement() {
    return document.createElement("dlink-poe-badge-editor");
  }
}

class DlinkPortBadge extends HTMLElement {
  setConfig(config) {
    if (!config.link) {
      throw new Error("Bitte 'link' (Link-Status-Entität) angeben.");
    }
    this._config = config;
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const connectedStates = this._config.connected_states;
    const stateObj = hass.states[this._config.link];
    const label = this._config.name || "Port";
    if (!stateObj) {
      this._textEl.textContent = `${label}: n/a`;
      this._chip.iconEl.icon = "mdi:help-circle-outline";
      setIconColor(this._chip.el, "grey", this._colors);
      return;
    }
    const connected = isConnectedState(stateObj, connectedStates);
    const speedObj = this._config.speed ? hass.states[this._config.speed] : null;
    const detail = connected && speedObj ? formatState(hass, speedObj) : formatState(hass, stateObj);
    this._textEl.textContent = `${label}: ${detail}`;
    this._chip.iconEl.icon = connected ? "mdi:lan-connect" : "mdi:lan-disconnect";
    setIconColor(this._chip.el, connected ? "green" : "grey", this._colors);
  }

  _buildDom() {
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES + getThemeCss(this._config);
    root.appendChild(style);
    this._chip = createBadgeChip("mdi:lan-connect", "grey", this._colors);
    this._chip.el.addEventListener("click", () => fireMoreInfo(this, this._config.link));
    this._textEl = this._chip.textEl;
    root.appendChild(this._chip.el);
  }

  static getStubConfig() {
    return { name: "Port 1", link: "binary_sensor.dgs1210_port_1_link" };
  }

  static getConfigElement() {
    return document.createElement("dlink-port-badge-editor");
  }
}

class DlinkPortsBadge extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._colors = getThemeColors(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const connectedStates = this._config.connected_states;
    let connectedCount = 0;
    let total = 0;
    for (const port of this._ports) {
      if (!port.link) continue;
      total++;
      const stateObj = hass.states[port.link];
      if (stateObj && isConnectedState(stateObj, connectedStates)) connectedCount++;
    }
    const colorKey = total === 0 ? "grey" : connectedCount === total ? "green" : connectedCount === 0 ? "red" : "amber";
    const prefix = this._config.title ? `${this._config.title}: ` : "";
    this._textEl.textContent = `${prefix}${connectedCount}/${total}`;
    setIconColor(this._chip.el, colorKey, this._colors);
  }

  _buildDom() {
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES + getThemeCss(this._config);
    root.appendChild(style);
    this._chip = createBadgeChip("mdi:lan-connect", "grey", this._colors);
    this._chip.el.style.cursor = "default";
    this._textEl = this._chip.textEl;
    root.appendChild(this._chip.el);
  }

  static getStubConfig() {
    return { title: "Ports", port_count: 8 };
  }

  static getConfigElement() {
    return document.createElement("dlink-ports-badge-editor");
  }
}

/* ------------------------------------------------------------------ */
/* Simple ha-form based editors (single-entity cards)                  */
/* ------------------------------------------------------------------ */
class BaseFormEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  get schema() {
    return [];
  }

  get fullSchema() {
    return [...this.schema, ...themeSchemaFields(this._config)];
  }

  computeLabel(schema) {
    return (this.labels && this.labels[schema.name]) || THEME_LABELS[schema.name] || schema.name;
  }

  computeHelper(schema) {
    return THEME_HELPERS[schema.name] || (this.helpers && this.helpers[schema.name]) || "";
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
      });
      const root = this.shadowRoot || this.attachShadow({ mode: "open" });
      root.innerHTML = "<style>ha-form{display:block;padding:12px;}</style>";
      root.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this.fullSchema;
    this._form.data = this._config;
    this._form.computeLabel = this.computeLabel.bind(this);
    this._form.computeHelper = this.computeHelper.bind(this);
  }
}

class DlinkPoeCardEditor extends BaseFormEditor {
  get schema() {
    return [
      { name: "name", selector: { text: {} } },
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      { name: "max_power", selector: { number: { mode: "box", min: 0 } } },
      { name: "warn_percent", selector: { number: { mode: "box", min: 0, max: 100 } } },
      { name: "critical_percent", selector: { number: { mode: "box", min: 0, max: 100 } } },
    ];
  }

  get labels() {
    return {
      name: "Titel",
      entity: "PoE-Leistungssensor",
      max_power: "Maximale PoE-Leistung (W)",
      warn_percent: "Warnschwelle (%)",
      critical_percent: "Kritische Schwelle (%)",
    };
  }
}

class DlinkPortCardEditor extends BaseFormEditor {
  get schema() {
    return [
      { name: "name", selector: { text: {} } },
      { name: "link", selector: { entity: {} } },
      { name: "speed", selector: { entity: { domain: "sensor" } } },
      { name: "traffic_in", selector: { entity: { domain: "sensor" } } },
      { name: "traffic_out", selector: { entity: { domain: "sensor" } } },
    ];
  }

  get labels() {
    return {
      name: "Titel",
      link: "Link-Status-Entität",
      speed: "Geschwindigkeits-Entität",
      traffic_in: "Traffic-eingehend-Entität",
      traffic_out: "Traffic-ausgehend-Entität",
    };
  }
}

/* ------------------------------------------------------------------ */
/* ha-form based editor for the "per-port" cards                       */
/* (dlink-switch-card, dlink-ports-grid-card, dlink-switch-summary-card,*/
/*  dlink-header-card, dlink-traffic-card, dlink-stats-card)           */
/* Renders one entity-picker field per signal (link/speed/traffic) for */
/* every single port, so every entity can be picked individually       */
/* instead of relying on an entity-id naming pattern. Also appends the */
/* shared theme fields, with the custom-theme fields only appearing    */
/* once "Benutzerdefiniert" is selected (schema is recomputed from the */
/* current config on every render).                                   */
/* Uses ha-form + selectors (like the built-in HA card editors) instead*/
/* of hand-created ha-entity-picker/ha-textfield elements, since those */
/* are only guaranteed to be registered/upgraded when loaded through   */
/* ha-form's own selector chunk - creating them directly can otherwise */
/* render as blank, un-upgraded elements.                              */
/* ------------------------------------------------------------------ */
class DlinkTemplatedPortsEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (this._lastDeviceId === undefined) this._lastDeviceId = this._config.device_id;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get portCount() {
    const config = this._config || {};
    if (Array.isArray(config.ports) && config.ports.length) return config.ports.length;
    return config.port_count || 8;
  }

  get schema() {
    const count = this.portCount;
    const schema = [
      { name: "device_id", selector: { device: {} } },
      { name: "title", selector: { text: {} } },
    ];
    if (this.showPoe) {
      schema.push({ name: "poe_entity", selector: { entity: { domain: "sensor" } } });
    }
    if (this.showMaxPower) {
      schema.push({ name: "max_power", selector: { number: { mode: "box", min: 0 } } });
    }
    schema.push({ name: "port_count", selector: { number: { mode: "box", min: 1, max: 52 } } });
    for (let i = 1; i <= count; i++) {
      schema.push({ name: `port_${i}_name`, selector: { text: {} } });
      if (this.showLinkSpeed !== false) {
        schema.push({ name: `port_${i}_link`, selector: { entity: {} } });
        schema.push({ name: `port_${i}_speed`, selector: { entity: { domain: "sensor" } } });
      }
      if (this.showTraffic) {
        schema.push({ name: `port_${i}_traffic_in`, selector: { entity: { domain: "sensor" } } });
        schema.push({ name: `port_${i}_traffic_out`, selector: { entity: { domain: "sensor" } } });
      }
    }
    if (this.showCompact) {
      schema.push({ name: "compact", selector: { boolean: {} } });
    }
    schema.push(...themeSchemaFields(this._config));
    return schema;
  }

  _labelFor(name) {
    if (THEME_LABELS[name]) return THEME_LABELS[name];
    if (name === "device_id") return "Gerät (füllt Ports automatisch aus)";
    if (name === "title") return "Titel";
    if (name === "poe_entity") return "PoE-Leistungssensor";
    if (name === "max_power") return "Maximales PoE-Budget (W)";
    if (name === "port_count") return "Anzahl Ports";
    if (name === "compact") return "Kompakt (ohne Traffic-Zeilen)";
    const match = /^port_(\d+)_(.+)$/.exec(name);
    if (match) {
      const [, num, field] = match;
      const fieldLabels = {
        name: "Name",
        link: "Link-Entität",
        speed: "Speed-Entität",
        traffic_in: "Traffic-eingehend-Entität",
        traffic_out: "Traffic-ausgehend-Entität",
      };
      return `Port ${num} – ${fieldLabels[field] || field}`;
    }
    return name;
  }

  _resolvedPorts() {
    const config = this._config || {};
    if (Array.isArray(config.ports) && config.ports.length) return config.ports;
    if (config.entities) return resolvePorts(config);
    return [];
  }

  _toFormData() {
    const config = this._config || {};
    const data = {
      device_id: config.device_id,
      title: config.title,
      poe_entity: config.poe_entity,
      max_power: config.max_power,
      port_count: this.portCount,
      compact: config.compact,
      theme: config.theme,
      custom_card_radius: config.custom_card_radius,
      custom_icon_radius: config.custom_icon_radius,
      custom_icon_filled: config.custom_icon_filled,
      custom_color_connected: config.custom_color_connected,
      custom_color_disconnected: config.custom_color_disconnected,
      custom_color_info: config.custom_color_info,
      custom_color_download: config.custom_color_download,
      custom_color_upload: config.custom_color_upload,
      custom_color_warning: config.custom_color_warning,
      custom_color_critical: config.custom_color_critical,
    };
    for (const port of this._resolvedPorts()) {
      data[`port_${port.port}_name`] = port.name;
      data[`port_${port.port}_link`] = port.link;
      data[`port_${port.port}_speed`] = port.speed;
      data[`port_${port.port}_traffic_in`] = port.traffic_in;
      data[`port_${port.port}_traffic_out`] = port.traffic_out;
    }
    return data;
  }

  _fromFormData(data) {
    const newConfig = { ...(this._config || {}) };
    newConfig.device_id = data.device_id;
    newConfig.title = data.title;
    if (this.showPoe) newConfig.poe_entity = data.poe_entity;
    if (this.showMaxPower) newConfig.max_power = data.max_power;
    newConfig.port_count = data.port_count;
    if (this.showCompact) newConfig.compact = data.compact;
    delete newConfig.entities;

    newConfig.theme = data.theme;
    if (data.theme === "custom") {
      newConfig.custom_card_radius = data.custom_card_radius;
      newConfig.custom_icon_radius = data.custom_icon_radius;
      newConfig.custom_icon_filled = data.custom_icon_filled;
      newConfig.custom_color_connected = data.custom_color_connected;
      newConfig.custom_color_disconnected = data.custom_color_disconnected;
      newConfig.custom_color_info = data.custom_color_info;
      newConfig.custom_color_download = data.custom_color_download;
      newConfig.custom_color_upload = data.custom_color_upload;
      newConfig.custom_color_warning = data.custom_color_warning;
      newConfig.custom_color_critical = data.custom_color_critical;
    }

    const ports = [];
    for (let i = 1; i <= data.port_count; i++) {
      ports.push({
        port: i,
        name: data[`port_${i}_name`] || `Port ${i}`,
        link: data[`port_${i}_link`],
        speed: data[`port_${i}_speed`],
        traffic_in: data[`port_${i}_traffic_in`],
        traffic_out: data[`port_${i}_traffic_out`],
      });
    }
    newConfig.ports = ports;

    if (data.device_id && data.device_id !== this._lastDeviceId) {
      this._lastDeviceId = data.device_id;
      const detected = detectPortsFromDevice(this._hass, data.device_id);

      if (this.showPoe && detected.poe_entity && !newConfig.poe_entity) {
        newConfig.poe_entity = detected.poe_entity;
      }

      const detectedPortNums = Object.keys(detected.ports).map(Number);
      if (detectedPortNums.length) {
        const maxDetected = Math.max(...detectedPortNums);
        if (maxDetected > newConfig.port_count) newConfig.port_count = maxDetected;

        const merged = [];
        for (let i = 1; i <= newConfig.port_count; i++) {
          const existing = newConfig.ports.find((p) => p.port === i) || { port: i, name: `Port ${i}` };
          const det = detected.ports[i] || {};
          merged.push({
            port: i,
            name: existing.name || `Port ${i}`,
            link: det.link || existing.link,
            speed: det.speed || existing.speed,
            traffic_in: det.traffic_in || existing.traffic_in,
            traffic_out: det.traffic_out || existing.traffic_out,
          });
        }
        newConfig.ports = merged;
      }
    } else if (!data.device_id) {
      this._lastDeviceId = undefined;
    }

    return newConfig;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const newConfig = this._fromFormData(ev.detail.value);
        this._config = newConfig;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig } }));
      });
      const root = this.shadowRoot || this.attachShadow({ mode: "open" });
      root.innerHTML = "<style>ha-form{display:block;padding:12px;}</style>";
      root.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this.schema;
    this._form.data = this._toFormData();
    this._form.computeLabel = (s) => this._labelFor(s.name);
    this._form.computeHelper = (s) => {
      if (THEME_HELPERS[s.name]) return THEME_HELPERS[s.name];
      if (s.name === "device_id") {
        return "Optional: Gerät der DGS-1210-Integration wählen, dann werden Port-Entitäten anhand von Namen (Portnummer + Link/Speed/Traffic/PoE) automatisch erkannt und eingetragen.";
      }
      if (s.name === "port_count") return "z.B. 10 bei einer DGS-1210-10P";
      if (s.name === "max_power") return "z.B. 78 W bei einer DGS-1210-10P/ME – bestimmt die Farbe (grün/gelb/rot).";
      return "";
    };
  }
}

class DlinkSwitchCardEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = true;
    this.showTraffic = true;
    this.showCompact = true;
  }
}

class DlinkPortsGridCardEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = false;
    this.showTraffic = false;
    this.showCompact = false;
  }
}

class DlinkSwitchSummaryCardEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = true;
    this.showTraffic = true;
    this.showCompact = false;
  }
}

class DlinkHeaderCardEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = true;
    this.showTraffic = false;
    this.showCompact = false;
    this.showMaxPower = true;
  }
}

class DlinkTrafficCardEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = false;
    this.showTraffic = true;
    this.showLinkSpeed = false;
    this.showCompact = false;
  }
}

class DlinkStatsCardEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = true;
    this.showTraffic = true;
    this.showMaxPower = true;
    this.showCompact = false;
  }
}

class DlinkPoeBadgeEditor extends BaseFormEditor {
  get schema() {
    return [
      { name: "name", selector: { text: {} } },
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      { name: "max_power", selector: { number: { mode: "box", min: 0 } } },
      { name: "warn_percent", selector: { number: { mode: "box", min: 0, max: 100 } } },
      { name: "critical_percent", selector: { number: { mode: "box", min: 0, max: 100 } } },
    ];
  }

  get labels() {
    return {
      name: "Label",
      entity: "PoE-Leistungssensor",
      max_power: "Maximale PoE-Leistung (W)",
      warn_percent: "Warnschwelle (%)",
      critical_percent: "Kritische Schwelle (%)",
    };
  }
}

class DlinkPortBadgeEditor extends BaseFormEditor {
  get schema() {
    return [
      { name: "name", selector: { text: {} } },
      { name: "link", selector: { entity: {} } },
      { name: "speed", selector: { entity: { domain: "sensor" } } },
    ];
  }

  get labels() {
    return {
      name: "Label",
      link: "Link-Entität",
      speed: "Speed-Entität (optional)",
    };
  }
}

class DlinkPortsBadgeEditor extends DlinkTemplatedPortsEditor {
  constructor() {
    super();
    this.showPoe = false;
    this.showTraffic = false;
    this.showCompact = false;
  }
}

customElements.define("dlink-poe-card-editor", DlinkPoeCardEditor);
customElements.define("dlink-port-card-editor", DlinkPortCardEditor);
customElements.define("dlink-switch-card-editor", DlinkSwitchCardEditor);
customElements.define("dlink-ports-grid-card-editor", DlinkPortsGridCardEditor);
customElements.define("dlink-switch-summary-card-editor", DlinkSwitchSummaryCardEditor);
customElements.define("dlink-header-card-editor", DlinkHeaderCardEditor);
customElements.define("dlink-traffic-card-editor", DlinkTrafficCardEditor);
customElements.define("dlink-stats-card-editor", DlinkStatsCardEditor);
customElements.define("dlink-poe-badge-editor", DlinkPoeBadgeEditor);
customElements.define("dlink-port-badge-editor", DlinkPortBadgeEditor);
customElements.define("dlink-ports-badge-editor", DlinkPortsBadgeEditor);

customElements.define("dlink-switch-card", DlinkSwitchCard);
customElements.define("dlink-ports-grid-card", DlinkPortsGridCard);
customElements.define("dlink-port-card", DlinkPortCard);
customElements.define("dlink-poe-card", DlinkPoeCard);
customElements.define("dlink-switch-summary-card", DlinkSwitchSummaryCard);
customElements.define("dlink-header-card", DlinkHeaderCard);
customElements.define("dlink-traffic-card", DlinkTrafficCard);
customElements.define("dlink-stats-card", DlinkStatsCard);
customElements.define("dlink-poe-badge", DlinkPoeBadge);
customElements.define("dlink-port-badge", DlinkPortBadge);
customElements.define("dlink-ports-badge", DlinkPortsBadge);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "dlink-header-card",
    name: "D-Link Switch – Header",
    description: "Hero-Kopfzeile für ein Switch-Dashboard: Status-Icon, Titel, Port-/PoE-Kurzinfo.",
    preview: false,
  },
  {
    type: "dlink-switch-card",
    name: "D-Link Switch – Portübersicht",
    description: "Vollständige Tabelle aller Ports mit Link-Status, Speed und Traffic.",
    preview: false,
  },
  {
    type: "dlink-ports-grid-card",
    name: "D-Link Switch – Port-Grid",
    description: "Kompakte Chip-Übersicht aller Ports mit Statusfarbe und Speed.",
    preview: false,
  },
  {
    type: "dlink-port-card",
    name: "D-Link Switch – Einzelner Port",
    description: "Detailkarte für einen einzelnen wichtigen Port (z.B. Uplink).",
    preview: false,
  },
  {
    type: "dlink-poe-card",
    name: "D-Link Switch – PoE-Verbrauch",
    description: "Zeigt den PoE-Gesamtverbrauch mit Auslastungsbalken an.",
    preview: false,
  },
  {
    type: "dlink-traffic-card",
    name: "D-Link Switch – Traffic gesamt",
    description: "Summe von eingehendem und ausgehendem Traffic über alle Ports.",
    preview: false,
  },
  {
    type: "dlink-stats-card",
    name: "D-Link Switch – Statistik",
    description: "Gauges für Port- und PoE-Auslastung plus Traffic-Statistik.",
    preview: false,
  },
  {
    type: "dlink-switch-summary-card",
    name: "D-Link Switch – Zusammenfassung",
    description: "Kompakte Glance-Karte mit Portstatus, Traffic-Summe und PoE.",
    preview: false,
  }
);

window.customBadges = window.customBadges || [];
window.customBadges.push(
  {
    type: "dlink-poe-badge",
    name: "D-Link Switch – PoE",
    description: "Kompaktes Badge mit PoE-Leistungsverbrauch, farbig je nach Auslastung.",
    preview: false,
  },
  {
    type: "dlink-port-badge",
    name: "D-Link Switch – Port",
    description: "Kompaktes Badge für den Status eines einzelnen Ports.",
    preview: false,
  },
  {
    type: "dlink-ports-badge",
    name: "D-Link Switch – Ports",
    description: "Kompaktes Badge mit der Anzahl verbundener Ports (z.B. 8/10).",
    preview: false,
  }
);

console.info(
  `%c DLINK-DGS1210-CARD %c v${CARD_VERSION} `,
  "color: white; background: #44739e; font-weight: 700;",
  "color: #44739e; background: white; font-weight: 700;"
);
