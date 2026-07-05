# D-Link DGS-1210 Switch Cards

Schöne, fertige Anzeigen für deinen D-Link Netzwerk-Switch (DGS-1210) im Home-Assistant-Dashboard – auswählen, ausfüllen, fertig. Kein Programmieren nötig.

<a href="https://my.home-assistant.io/redirect/hacs_repository/?repository=D-link-Card&owner=Max6025&category=dashboard" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Öffne deine Home-Assistant-Instanz und füge dieses Repository zu HACS hinzu." /></a>

---

## Worum geht es?

Wenn deine D-Link-Integration eingerichtet ist, zeigt Home Assistant dir viele einzelne Werte an: ob Port 1 verbunden ist, wie schnell er ist, wie viele Daten dort durchlaufen, wie viel Strom über PoE verbraucht wird – und das für jeden Port einzeln. Als lange Liste ist das schnell unübersichtlich.

Dieses Paket bringt dir stattdessen fertige, hübsche Anzeigen für dein Dashboard: eine Kopfzeile, die auf einen Blick zeigt, ob alles in Ordnung ist. Eine Übersicht aller Ports mit farbigen Symbolen. Kleine Ringdiagramme für die Auslastung. Und noch einiges mehr – siehe unten.

Du suchst dir einfach die passenden Anzeigen aus einer Liste aus und wählst per Klick die passenden Sensoren aus. Der Rest erledigt sich von selbst.

---

## Installation

1. Auf den grünen Knopf oben klicken – er öffnet HACS direkt in deiner Home-Assistant-Instanz.
2. Herunterladen/Installieren bestätigen.
3. Home Assistant einmal neu laden (Browser-Seite aktualisieren reicht meistens).

Fertig – die neuen Anzeigen stehen jetzt beim Bearbeiten eines Dashboards zur Auswahl bereit.

---

## Die Anzeigen (Karten)

Das sind die fertigen Bausteine, die du auf deinem Dashboard platzieren kannst:

| Anzeige | Was du siehst |
|---|---|
| **Header** | Eine kompakte Kopfzeile für ganz oben: ein Symbol, das grün, gelb oder rot leuchtet, plus "8 von 10 Ports verbunden · 42 W PoE" |
| **Portübersicht** | Eine vollständige, übersichtliche Liste aller Ports mit Verbindung, Geschwindigkeit und Datenverkehr |
| **Port-Grid** | Alle Ports als kleine, farbige Kapseln nebeneinander – auf einen Blick sehen, was verbunden ist |
| **Einzelner Port** | Eine Detailanzeige für einen besonders wichtigen Port, z. B. den Uplink zum Router |
| **PoE-Verbrauch** | Große Zahl mit Balken, wie viel Strom aktuell über PoE verbraucht wird |
| **Traffic gesamt** | Zwei große Zahlen: wie viele Daten insgesamt herein- und herausgehen |
| **Statistik** | Zwei Ringdiagramme (Portauslastung, PoE-Auslastung) plus Datenverkehr |
| **Zusammenfassung** | Eine kompakte Kachel mit allem Wichtigen auf einen Blick – ideal für das Hauptdashboard |

## Die Badges

Badges sind die kleinen Pillen, die oben in einer Dashboard-Ansicht neben den Reitern erscheinen – nicht Teil des normalen Kartenbereichs.

| Badge | Was du siehst |
|---|---|
| **PoE** | Kleine Pille mit dem aktuellen PoE-Verbrauch |
| **Port** | Kleine Pille mit dem Status eines einzelnen Ports |
| **Ports** | Kleine Pille mit der Anzahl verbundener Ports, z. B. "8/10" |

---

## So richtest du eine Anzeige ein

1. Dashboard bearbeiten (Stift-Symbol oben rechts) → **Karte hinzufügen** (bzw. bei Badges: Ansicht bearbeiten → **Badges**).
2. Ganz unten in der Liste nach **„D-Link Switch"** suchen und die gewünschte Anzeige antippen.
3. Ganz oben im Editor **„Gerät"** auswählen: dein D-Link-Switch aus der Liste. Home Assistant füllt daraufhin automatisch alle passenden Sensoren aus – Portnummer, Verbindung, Geschwindigkeit, Datenverkehr, PoE.
4. Kurz prüfen, ob alles richtig erkannt wurde, bei Bedarf einzelne Felder von Hand nachjustieren.
5. Speichern.

Falls die automatische Erkennung mal daneben liegt, kannst du jedes Feld auch einfach selbst über die Sensor-Auswahl setzen – ganz ohne Programmieren.

---

## Aussehen anpassen

Jede Anzeige hat im Editor ganz unten ein Feld **„Design"**, mit dem du den Stil umstellen kannst:

- **Mushroom** – abgerundet, farbig, modern (Standard)
- **Vanilla** – schlicht, wie die klassische Home-Assistant-Ansicht
- **Minimal** – besonders kompakt, für vollgepackte Dashboards
- **Glas** – zarte Umrisse statt Farbflächen
- **Benutzerdefiniert** – hier kannst du Ecken, Formen und jede einzelne Farbe selbst festlegen

Das Design lässt sich für jede Anzeige einzeln wählen.

---

<details>
<summary><strong>Für Technikbegeisterte: YAML-Konfiguration & Details</strong></summary>

### Voraussetzung

Diese Karten zeigen nur Daten an, die deine bestehende DGS-1210-Integration bereits als Entitäten in Home Assistant bereitstellt (z. B. `binary_sensor.dgs1210_port_1_link`, `sensor.dgs1210_port_1_speed`, `sensor.dgs1210_port_1_traffic_in`, `sensor.dgs1210_port_1_traffic_out`, `sensor.dgs1210_poe_power`).

### HACS ohne Release

Damit HACS eine Version erkennt, sollte im Repository mindestens ein GitHub-Release existieren. Ohne Release lässt es sich über HACS trotzdem als Custom Repository (Kategorie **Dashboard**) hinzufügen und vom Standard-Branch installieren.

### Header — `dlink-header-card`

```yaml
type: custom:dlink-header-card
title: DGS-1210-10P
poe_entity: sensor.dgs1210_poe_power
max_power: 78
ports:
  - port: 1
    link: binary_sensor.dgs1210_port_1_link
  - port: 2
    link: binary_sensor.dgs1210_port_2_link
```

### Portübersicht — `dlink-switch-card`

```yaml
type: custom:dlink-switch-card
title: DGS-1210-10P
poe_entity: sensor.dgs1210_poe_power
ports:
  - port: 1
    name: Uplink Router
    link: binary_sensor.dgs1210_port_1_link
    speed: sensor.dgs1210_port_1_speed
    traffic_in: sensor.dgs1210_port_1_traffic_in
    traffic_out: sensor.dgs1210_port_1_traffic_out
compact: false   # true = nur Link + Speed, ohne Traffic-Zeilen
```

Alternativ per Entity-Vorlage (nur YAML, falls alle Ports demselben Namensmuster folgen; `{port}` wird durch die Portnummer ersetzt):

```yaml
type: custom:dlink-switch-card
title: DGS-1210-10P
poe_entity: sensor.dgs1210_poe_power
port_count: 10
entities:
  link: binary_sensor.dgs1210_port_{port}_link
  speed: sensor.dgs1210_port_{port}_speed
  traffic_in: sensor.dgs1210_port_{port}_traffic_in
  traffic_out: sensor.dgs1210_port_{port}_traffic_out
```

### Port-Grid — `dlink-ports-grid-card`

```yaml
type: custom:dlink-ports-grid-card
title: Portstatus
port_count: 10
entities:
  link: binary_sensor.dgs1210_port_{port}_link
  speed: sensor.dgs1210_port_{port}_speed
```

### Einzelner Port — `dlink-port-card`

```yaml
type: custom:dlink-port-card
name: Uplink zum Router
link: binary_sensor.dgs1210_port_1_link
speed: sensor.dgs1210_port_1_speed
traffic_in: sensor.dgs1210_port_1_traffic_in
traffic_out: sensor.dgs1210_port_1_traffic_out
```

### PoE-Verbrauch — `dlink-poe-card`

```yaml
type: custom:dlink-poe-card
name: PoE-Leistungsverbrauch
entity: sensor.dgs1210_poe_power
max_power: 78
warn_percent: 70
critical_percent: 90
```

`max_power` ist optional — ohne diesen Wert wird nur die aktuelle Leistung ohne Balken angezeigt.

### Traffic gesamt — `dlink-traffic-card`

```yaml
type: custom:dlink-traffic-card
title: Gesamter Datenverkehr
port_count: 10
entities:
  traffic_in: sensor.dgs1210_port_{port}_traffic_in
  traffic_out: sensor.dgs1210_port_{port}_traffic_out
```

### Statistik — `dlink-stats-card`

```yaml
type: custom:dlink-stats-card
title: DGS-1210 Statistik
poe_entity: sensor.dgs1210_poe_power
max_power: 78
port_count: 10
entities:
  link: binary_sensor.dgs1210_port_{port}_link
  traffic_in: sensor.dgs1210_port_{port}_traffic_in
  traffic_out: sensor.dgs1210_port_{port}_traffic_out
```

### Zusammenfassung — `dlink-switch-summary-card`

```yaml
type: custom:dlink-switch-summary-card
title: DGS-1210
poe_entity: sensor.dgs1210_poe_power
port_count: 10
entities:
  link: binary_sensor.dgs1210_port_{port}_link
  traffic_in: sensor.dgs1210_port_{port}_traffic_in
  traffic_out: sensor.dgs1210_port_{port}_traffic_out
```

> Hinweis: Traffic-Summen werden direkt addiert – alle Traffic-Sensoren sollten dieselbe Einheit verwenden (z. B. GB).

### Badges

```yaml
views:
  - title: Netzwerk
    badges:
      - type: custom:dlink-poe-badge
        name: PoE
        entity: sensor.dgs1210_poe_power
        max_power: 78
      - type: custom:dlink-ports-badge
        title: Ports
        port_count: 10
        entities:
          link: binary_sensor.dgs1210_port_{port}_link
      - type: custom:dlink-port-badge
        name: Uplink
        link: binary_sensor.dgs1210_port_1_link
        speed: sensor.dgs1210_port_1_speed
    cards:
      # ...
```

### Design per YAML (Benutzerdefiniert)

```yaml
type: custom:dlink-header-card
title: DGS-1210-10P
port_count: 10
theme: custom
custom_card_radius: 20
custom_icon_radius: 20
custom_icon_filled: false
custom_color_connected: [56, 142, 60]
custom_color_disconnected: [120, 120, 120]
custom_color_warning: [255, 179, 0]
custom_color_critical: [211, 47, 47]
```

### Gemeinsame Optionen

Alle Karten mit Port-Liste unterstützen zusätzlich `connected_states`: eine Liste von Zustandswerten, die als "verbunden" gelten (Standard: `["on", "connected", "verbunden", "up", "true"]`). Nützlich, falls deine Integration den Link-Status als `sensor` statt `binary_sensor` mit anderen Textwerten liefert.

</details>

---

## Lizenz

MIT
