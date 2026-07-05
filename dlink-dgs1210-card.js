/*
 * D-Link DGS-1210 Switch Cards for Home Assistant
 * A collection of custom Lovelace cards for visualizing data provided by a
 * DGS-1210 switch integration (link status, speed, traffic, PoE consumption).
 *
 * Cards provided:
 *  - dlink-switch-card           full port table (all ports, all details)
 *  - dlink-ports-grid-card       compact tile grid of all ports
 *  - dlink-port-card             detail card for a single port
 *  - dlink-poe-card              PoE power consumption card with usage bar
 *  - dlink-switch-summary-card   glance-style summary of the whole switch
 */

const CARD_VERSION = "1.1.1";

const DEFAULT_CONNECTED_STATES = ["on", "connected", "verbunden", "up", "true"];

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

function validatePortsConfig(config) {
  const hasExplicitPorts = Array.isArray(config.ports) && config.ports.length;
  const hasTemplate = config.entities && (config.entities.link || config.entities.speed);
  if (!hasExplicitPorts && !hasTemplate) {
    throw new Error(
      "Bitte entweder 'ports' (Liste) oder 'entities' + 'port_count' in der Konfiguration angeben."
    );
  }
}

const SHARED_STYLES = `
  ha-card {
    padding: 16px;
  }
  .dlink-title {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--ha-card-header-color, var(--primary-text-color));
    margin-bottom: 8px;
  }
  .dlink-row {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--divider-color, rgba(127,127,127,0.15));
    cursor: pointer;
  }
  .dlink-row:last-child {
    border-bottom: none;
  }
  .dlink-icon {
    --mdc-icon-size: 22px;
    color: var(--paper-item-icon-color, #44739e);
    margin-right: 14px;
    flex-shrink: 0;
  }
  .dlink-row-text {
    flex: 1;
    min-width: 0;
    color: var(--primary-text-color);
  }
  .dlink-label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dlink-sublabel {
    display: block;
    font-size: 0.85rem;
    color: var(--secondary-text-color);
  }
  .dlink-value {
    color: var(--primary-text-color);
    text-align: right;
    flex-shrink: 0;
    padding-left: 8px;
  }
  .dlink-port-heading {
    font-weight: 500;
    color: var(--secondary-text-color);
    padding: 12px 0 4px 0;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }
  .dlink-port-heading:first-of-type {
    padding-top: 0;
  }
`;

function createInfoRow(icon) {
  const row = document.createElement("div");
  row.className = "dlink-row";
  row.innerHTML = `
    <ha-icon class="dlink-icon"></ha-icon>
    <div class="dlink-row-text">
      <span class="dlink-label"></span>
    </div>
    <span class="dlink-value"></span>
  `;
  const iconEl = row.querySelector(".dlink-icon");
  iconEl.icon = icon;
  const labelEl = row.querySelector(".dlink-label");
  const valueEl = row.querySelector(".dlink-value");
  return { row, iconEl, labelEl, valueEl };
}

function updateLinkRow(hass, entry, connectedStates) {
  const { entity, iconEl, valueEl } = entry;
  const stateObj = hass.states[entity];
  if (!stateObj) {
    valueEl.textContent = "nicht gefunden";
    iconEl.icon = "mdi:help-circle-outline";
    iconEl.style.color = "var(--disabled-text-color)";
    return;
  }
  const connected = isConnectedState(stateObj, connectedStates);
  valueEl.textContent = formatState(hass, stateObj);
  iconEl.icon = connected ? "mdi:lan-connect" : "mdi:lan-disconnect";
  iconEl.style.color = connected
    ? "var(--dlink-connected-color, var(--success-color, #43a047))"
    : "var(--dlink-disconnected-color, var(--disabled-text-color, #9e9e9e))";
}

function updateValueRow(hass, entry, icon) {
  const { entity, iconEl, valueEl } = entry;
  const stateObj = hass.states[entity];
  if (!stateObj) {
    valueEl.textContent = "nicht gefunden";
    iconEl.style.color = "var(--disabled-text-color)";
    return;
  }
  valueEl.textContent = formatState(hass, stateObj);
  iconEl.icon = icon;
  iconEl.style.color = "var(--paper-item-icon-color, #44739e)";
}

/* ------------------------------------------------------------------ */
/* dlink-switch-card - full port table                                 */
/* ------------------------------------------------------------------ */
class DlinkSwitchCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rows) return;
    const connectedStates = this._config.connected_states;
    if (this._poeRow) {
      updateValueRow(hass, this._poeRow, "mdi:flash");
    }
    for (const entry of this._rows) {
      if (entry.kind === "link") updateLinkRow(hass, entry, connectedStates);
      else if (entry.kind === "speed") updateValueRow(hass, entry, "mdi:speedometer");
      else if (entry.kind === "traffic_in") updateValueRow(hass, entry, "mdi:download-network-outline");
      else if (entry.kind === "traffic_out") updateValueRow(hass, entry, "mdi:upload-network-outline");
    }
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES;
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
      const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:flash");
      labelEl.textContent = "PoE-Leistungsverbrauch";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.poe_entity));
      card.appendChild(row);
      this._poeRow = { entity: this._config.poe_entity, iconEl, valueEl };
    }

    const compact = !!this._config.compact;

    for (const port of this._ports) {
      const heading = document.createElement("div");
      heading.className = "dlink-port-heading";
      heading.textContent = port.name;
      card.appendChild(heading);

      if (port.link) {
        const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:lan-connect");
        labelEl.textContent = `${port.name} Link`;
        row.addEventListener("click", () => fireMoreInfo(this, port.link));
        card.appendChild(row);
        this._rows.push({ entity: port.link, kind: "link", iconEl, valueEl });
      }
      if (port.speed) {
        const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:speedometer");
        labelEl.textContent = `${port.name} Speed`;
        row.addEventListener("click", () => fireMoreInfo(this, port.speed));
        card.appendChild(row);
        this._rows.push({ entity: port.speed, kind: "speed", iconEl, valueEl });
      }
      if (!compact && port.traffic_in) {
        const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:download-network-outline");
        labelEl.textContent = `${port.name} Traffic in`;
        row.addEventListener("click", () => fireMoreInfo(this, port.traffic_in));
        card.appendChild(row);
        this._rows.push({ entity: port.traffic_in, kind: "traffic_in", iconEl, valueEl });
      }
      if (!compact && port.traffic_out) {
        const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:upload-network-outline");
        labelEl.textContent = `${port.name} Traffic out`;
        row.addEventListener("click", () => fireMoreInfo(this, port.traffic_out));
        card.appendChild(row);
        this._rows.push({ entity: port.traffic_out, kind: "traffic_out", iconEl, valueEl });
      }
    }
  }

  getCardSize() {
    const rowsPerPort = this._config && this._config.compact ? 2 : 4;
    return 1 + (this._ports ? this._ports.length * rowsPerPort : 0) / 3;
  }

  static getStubConfig(hass) {
    return {
      title: "DGS-1210",
      port_count: 8,
      entities: {
        link: "binary_sensor.dgs1210_port_{port}_link",
        speed: "sensor.dgs1210_port_{port}_speed",
        traffic_in: "sensor.dgs1210_port_{port}_traffic_in",
        traffic_out: "sensor.dgs1210_port_{port}_traffic_out",
      },
    };
  }

  static getConfigElement() {
    return document.createElement("dlink-switch-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* dlink-ports-grid-card - compact tile grid of all ports               */
/* ------------------------------------------------------------------ */
class DlinkPortsGridCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
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

      chip.dot.style.background =
        connected === null
          ? "var(--disabled-text-color, #9e9e9e)"
          : connected
          ? "var(--dlink-connected-color, var(--success-color, #43a047))"
          : "var(--dlink-disconnected-color, var(--disabled-text-color, #9e9e9e))";

      chip.speedEl.textContent = speedState ? formatState(hass, speedState) : connected ? "" : "–";
    }
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_STYLES}
      .dlink-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
        gap: 10px;
      }
      .dlink-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 10px 4px;
        border-radius: var(--ha-card-border-radius, 10px);
        background: var(--secondary-background-color, rgba(127,127,127,0.08));
        cursor: pointer;
      }
      .dlink-chip-port {
        font-size: 0.75rem;
        color: var(--secondary-text-color);
      }
      .dlink-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }
      .dlink-chip-speed {
        font-size: 0.7rem;
        color: var(--primary-text-color);
        min-height: 1em;
      }
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
        <span class="dlink-chip-port">P${port.port}</span>
        <span class="dlink-dot"></span>
        <span class="dlink-chip-speed"></span>
      `;
      chip.addEventListener("click", () => fireMoreInfo(this, port.link || port.speed));
      grid.appendChild(chip);
      this._chips.push({
        link: port.link,
        speed: port.speed,
        dot: chip.querySelector(".dlink-dot"),
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
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const connectedStates = this._config.connected_states;
    if (this._linkEntry) updateLinkRow(hass, this._linkEntry, connectedStates);
    if (this._speedEntry) updateValueRow(hass, this._speedEntry, "mdi:speedometer");
    if (this._inEntry) updateValueRow(hass, this._inEntry, "mdi:download-network-outline");
    if (this._outEntry) updateValueRow(hass, this._outEntry, "mdi:upload-network-outline");
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = SHARED_STYLES;
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
      const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:lan-connect");
      labelEl.textContent = "Verbindung";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.link));
      card.appendChild(row);
      this._linkEntry = { entity: this._config.link, iconEl, valueEl };
    }
    if (this._config.speed) {
      const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:speedometer");
      labelEl.textContent = "Geschwindigkeit";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.speed));
      card.appendChild(row);
      this._speedEntry = { entity: this._config.speed, iconEl, valueEl };
    }
    if (this._config.traffic_in) {
      const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:download-network-outline");
      labelEl.textContent = "Traffic eingehend";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.traffic_in));
      card.appendChild(row);
      this._inEntry = { entity: this._config.traffic_in, iconEl, valueEl };
    }
    if (this._config.traffic_out) {
      const { row, iconEl, labelEl, valueEl } = createInfoRow("mdi:upload-network-outline");
      labelEl.textContent = "Traffic ausgehend";
      row.addEventListener("click", () => fireMoreInfo(this, this._config.traffic_out));
      card.appendChild(row);
      this._outEntry = { entity: this._config.traffic_out, iconEl, valueEl };
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
    this._buildDom();
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (!stateObj) {
      this._valueEl.textContent = "nicht gefunden";
      return;
    }
    const value = numericValue(stateObj);
    const unit = stateObj.attributes.unit_of_measurement || "W";
    this._valueEl.textContent = value != null ? `${formatState(hass, stateObj)}` : stateObj.state;
    this._unitEl.textContent = "";

    const maxPower = this._config.max_power;
    if (maxPower && value != null) {
      const percent = Math.max(0, Math.min(100, (value / maxPower) * 100));
      const warn = this._config.warn_percent != null ? this._config.warn_percent : 70;
      const critical = this._config.critical_percent != null ? this._config.critical_percent : 90;
      let color = "var(--success-color, #43a047)";
      if (percent >= critical) color = "var(--error-color, #e53935)";
      else if (percent >= warn) color = "var(--warning-color, #fb8c00)";
      this._barFill.style.width = `${percent}%`;
      this._barFill.style.background = color;
      this._barWrap.style.display = "block";
      this._percentEl.textContent = `${percent.toFixed(0)}% von ${maxPower} ${unit}`;
    } else {
      this._barWrap.style.display = "none";
      this._percentEl.textContent = "";
    }
  }

  _buildDom() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      ha-card {
        padding: 16px;
        cursor: pointer;
      }
      .dlink-poe-title {
        font-size: 1rem;
        color: var(--secondary-text-color);
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .dlink-poe-value {
        font-size: 2.2rem;
        font-weight: 400;
        color: var(--primary-text-color);
      }
      .dlink-poe-bar-wrap {
        margin-top: 12px;
        height: 8px;
        border-radius: 4px;
        background: var(--secondary-background-color, rgba(127,127,127,0.15));
        overflow: hidden;
      }
      .dlink-poe-bar-fill {
        height: 100%;
        width: 0%;
        transition: width 0.4s ease, background 0.4s ease;
      }
      .dlink-poe-percent {
        margin-top: 6px;
        font-size: 0.8rem;
        color: var(--secondary-text-color);
      }
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    card.addEventListener("click", () => fireMoreInfo(this, this._config.entity));
    root.appendChild(card);

    const title = document.createElement("div");
    title.className = "dlink-poe-title";
    title.innerHTML = `<ha-icon icon="mdi:flash"></ha-icon><span>${this._config.name || "PoE-Leistungsverbrauch"}</span>`;
    card.appendChild(title);

    const value = document.createElement("div");
    value.className = "dlink-poe-value";
    value.innerHTML = `<span class="dlink-poe-value-num"></span><span class="dlink-poe-value-unit"></span>`;
    card.appendChild(value);
    this._valueEl = value.querySelector(".dlink-poe-value-num");
    this._unitEl = value.querySelector(".dlink-poe-value-unit");

    this._barWrap = document.createElement("div");
    this._barWrap.className = "dlink-poe-bar-wrap";
    this._barFill = document.createElement("div");
    this._barFill.className = "dlink-poe-bar-fill";
    this._barWrap.appendChild(this._barFill);
    card.appendChild(this._barWrap);

    this._percentEl = document.createElement("div");
    this._percentEl.className = "dlink-poe-percent";
    card.appendChild(this._percentEl);
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
/* dlink-switch-summary-card - glance-style overview                   */
/* ------------------------------------------------------------------ */
class DlinkSwitchSummaryCard extends HTMLElement {
  setConfig(config) {
    validatePortsConfig(config);
    this._config = config;
    this._ports = resolvePorts(config);
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
      ha-card {
        padding: 16px;
      }
      .dlink-summary-title {
        font-size: 1rem;
        color: var(--secondary-text-color);
        margin-bottom: 12px;
      }
      .dlink-summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        gap: 12px;
      }
      .dlink-summary-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      }
      .dlink-summary-tile ha-icon {
        color: var(--paper-item-icon-color, #44739e);
      }
      .dlink-summary-value {
        font-size: 1.1rem;
        color: var(--primary-text-color);
      }
      .dlink-summary-label {
        font-size: 0.75rem;
        color: var(--secondary-text-color);
        text-align: center;
      }
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "dlink-summary-title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const grid = document.createElement("div");
    grid.className = "dlink-summary-grid";
    card.appendChild(grid);

    const portsTile = document.createElement("div");
    portsTile.className = "dlink-summary-tile";
    portsTile.innerHTML = `
      <ha-icon icon="mdi:lan-connect"></ha-icon>
      <span class="dlink-summary-value"></span>
      <span class="dlink-summary-label">Ports verbunden</span>
    `;
    grid.appendChild(portsTile);
    this._portsValueEl = portsTile.querySelector(".dlink-summary-value");

    const inTile = document.createElement("div");
    inTile.className = "dlink-summary-tile";
    inTile.innerHTML = `
      <ha-icon icon="mdi:download-network-outline"></ha-icon>
      <span class="dlink-summary-value"></span>
      <span class="dlink-summary-label">Traffic ein</span>
    `;
    grid.appendChild(inTile);
    this._inValueEl = inTile.querySelector(".dlink-summary-value");

    const outTile = document.createElement("div");
    outTile.className = "dlink-summary-tile";
    outTile.innerHTML = `
      <ha-icon icon="mdi:upload-network-outline"></ha-icon>
      <span class="dlink-summary-value"></span>
      <span class="dlink-summary-label">Traffic aus</span>
    `;
    grid.appendChild(outTile);
    this._outValueEl = outTile.querySelector(".dlink-summary-value");

    if (this._config.poe_entity) {
      const poeTile = document.createElement("div");
      poeTile.className = "dlink-summary-tile";
      poeTile.innerHTML = `
        <ha-icon icon="mdi:flash"></ha-icon>
        <span class="dlink-summary-value"></span>
        <span class="dlink-summary-label">PoE</span>
      `;
      poeTile.addEventListener("click", () => fireMoreInfo(this, this._config.poe_entity));
      grid.appendChild(poeTile);
      this._poeValueEl = poeTile.querySelector(".dlink-summary-value");
    }
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig(hass) {
    return {
      title: "DGS-1210",
      poe_entity: "sensor.dgs1210_poe_power",
      port_count: 8,
      entities: {
        link: "binary_sensor.dgs1210_port_{port}_link",
        traffic_in: "sensor.dgs1210_port_{port}_traffic_in",
        traffic_out: "sensor.dgs1210_port_{port}_traffic_out",
      },
    };
  }

  static getConfigElement() {
    return document.createElement("dlink-switch-summary-card-editor");
  }
}

/* ------------------------------------------------------------------ */
/* Simple ha-form based editors                                        */
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

  computeLabel(schema) {
    return this.labels && this.labels[schema.name] ? this.labels[schema.name] : schema.name;
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
    this._form.schema = this.schema;
    this._form.data = this._config;
    this._form.computeLabel = this.computeLabel.bind(this);
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
/* ha-form based editor for the "templated ports" cards                */
/* (dlink-switch-card, dlink-ports-grid-card, dlink-switch-summary-card)*/
/* Uses ha-form + selectors (like the built-in HA card editors) instead*/
/* of hand-created ha-entity-picker/ha-textfield elements, since those */
/* are only guaranteed to be registered/upgraded when loaded through   */
/* ha-form's own selector chunk - creating them directly can otherwise */
/* render as blank, un-upgraded elements.                              */
/* ------------------------------------------------------------------ */
class DlinkTemplatedPortsEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get schema() {
    const schema = [{ name: "title", selector: { text: {} } }];
    if (this.showPoe) {
      schema.push({ name: "poe_entity", selector: { entity: { domain: "sensor" } } });
    }
    schema.push({ name: "port_count", selector: { number: { mode: "box", min: 1, max: 52 } } });
    schema.push({ name: "entities_link", selector: { text: {} } });
    schema.push({ name: "entities_speed", selector: { text: {} } });
    if (this.showTraffic) {
      schema.push({ name: "entities_traffic_in", selector: { text: {} } });
      schema.push({ name: "entities_traffic_out", selector: { text: {} } });
    }
    if (this.showCompact) {
      schema.push({ name: "compact", selector: { boolean: {} } });
    }
    return schema;
  }

  get labels() {
    return {
      title: "Titel",
      poe_entity: "PoE-Leistungssensor",
      port_count: "Anzahl Ports",
      entities_link: "Link-Entity-Vorlage",
      entities_speed: "Speed-Entity-Vorlage",
      entities_traffic_in: "Traffic-in-Entity-Vorlage",
      entities_traffic_out: "Traffic-out-Entity-Vorlage",
      compact: "Kompakt (ohne Traffic-Zeilen)",
    };
  }

  get helpers() {
    return {
      port_count: "z.B. 10 bei einer DGS-1210-10P",
      entities_link:
        "{port} wird durch die Portnummer ersetzt, z.B. binary_sensor.dgs1210_port_{port}_link",
      entities_speed: "z.B. sensor.dgs1210_port_{port}_speed",
      entities_traffic_in: "z.B. sensor.dgs1210_port_{port}_traffic_in",
      entities_traffic_out: "z.B. sensor.dgs1210_port_{port}_traffic_out",
    };
  }

  _toFormData(config) {
    const entities = config.entities || {};
    return {
      title: config.title,
      poe_entity: config.poe_entity,
      port_count: config.port_count,
      entities_link: entities.link,
      entities_speed: entities.speed,
      entities_traffic_in: entities.traffic_in,
      entities_traffic_out: entities.traffic_out,
      compact: config.compact,
    };
  }

  _fromFormData(data) {
    const newConfig = { ...this._config };
    newConfig.title = data.title;
    if (this.showPoe) newConfig.poe_entity = data.poe_entity;
    newConfig.port_count = data.port_count;
    newConfig.entities = { ...(newConfig.entities || {}) };
    newConfig.entities.link = data.entities_link;
    newConfig.entities.speed = data.entities_speed;
    if (this.showTraffic) {
      newConfig.entities.traffic_in = data.entities_traffic_in;
      newConfig.entities.traffic_out = data.entities_traffic_out;
    }
    if (this.showCompact) newConfig.compact = data.compact;
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
    this._form.data = this._toFormData(this._config);
    this._form.computeLabel = (s) => this.labels[s.name] || s.name;
    this._form.computeHelper = (s) => this.helpers[s.name] || "";
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

customElements.define("dlink-poe-card-editor", DlinkPoeCardEditor);
customElements.define("dlink-port-card-editor", DlinkPortCardEditor);
customElements.define("dlink-switch-card-editor", DlinkSwitchCardEditor);
customElements.define("dlink-ports-grid-card-editor", DlinkPortsGridCardEditor);
customElements.define("dlink-switch-summary-card-editor", DlinkSwitchSummaryCardEditor);

customElements.define("dlink-switch-card", DlinkSwitchCard);
customElements.define("dlink-ports-grid-card", DlinkPortsGridCard);
customElements.define("dlink-port-card", DlinkPortCard);
customElements.define("dlink-poe-card", DlinkPoeCard);
customElements.define("dlink-switch-summary-card", DlinkSwitchSummaryCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "dlink-switch-card",
    name: "D-Link Switch – Portübersicht",
    description: "Vollständige Tabelle aller Ports mit Link-Status, Speed und Traffic.",
    preview: false,
  },
  {
    type: "dlink-ports-grid-card",
    name: "D-Link Switch – Port-Grid",
    description: "Kompakte Kachel-Übersicht aller Ports mit Statusfarbe und Speed.",
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
    type: "dlink-switch-summary-card",
    name: "D-Link Switch – Zusammenfassung",
    description: "Kompakte Glance-Karte mit Portstatus, Traffic-Summe und PoE.",
    preview: false,
  }
);

console.info(
  `%c DLINK-DGS1210-CARD %c v${CARD_VERSION} `,
  "color: white; background: #44739e; font-weight: 700;",
  "color: #44739e; background: white; font-weight: 700;"
);
