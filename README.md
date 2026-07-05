# D-Link DGS-1210 Switch Cards

Custom Lovelace-Karten für Home Assistant, um die Daten deiner DGS-1210-Integration
(Port-Link, Speed, Traffic, PoE-Leistungsverbrauch) übersichtlich darzustellen.

Statt einer langen `entities`-Karte mit 40+ Zeilen (Port 1–10 × Link/Speed/Traffic
in/out) stehen fünf verschiedene, spezialisierte Karten zur Auswahl:

| Karte | Typ | Wofür |
|---|---|---|
| Portübersicht | `dlink-switch-card` | Vollständige Tabelle aller Ports (wie bisher, aber sauberer, mit Farben & Icons) |
| Port-Grid | `dlink-ports-grid-card` | Kompakte Kachel-Übersicht aller Ports auf einen Blick (Ampel-Farbe + Speed) |
| Einzelner Port | `dlink-port-card` | Detailkarte für einen wichtigen Port (z.B. Uplink zum Router oder NAS) |
| PoE-Verbrauch | `dlink-poe-card` | Große Anzeige des PoE-Gesamtverbrauchs mit Auslastungsbalken |
| Zusammenfassung | `dlink-switch-summary-card` | Glance-Karte: verbundene Ports, Traffic-Summe, PoE – ideal fürs Haupt-Dashboard |

## Installation über HACS

1. HACS öffnen → **Frontend** → Menü (⋮) oben rechts → **Benutzerdefinierte Repositories**.
2. Repository-URL dieses Repos eintragen, Kategorie **Dashboard** wählen, hinzufügen.
3. Nach dem Hinzufügen **„D-Link DGS-1210 Switch Cards"** suchen und installieren.
4. Home Assistant neu laden (Browser-Cache leeren, falls die Karte nicht erscheint).

> Damit HACS eine Version erkennt, muss im Repository mindestens ein GitHub
> **Release** (z.B. Tag `v1.0.0`) existieren.

Die Ressource wird von HACS automatisch als Lovelace-Resource eingetragen. Falls
nicht, manuell unter **Einstellungen → Dashboards → Ressourcen** hinzufügen:

```
URL: /hacsfiles/dlink-dgs1210-card/dlink-dgs1210-card.js
Typ: JavaScript-Modul
```

## Einrichtung über die UI (ohne YAML)

Alle fünf Karten haben einen grafischen Editor. So richtest du sie über die Oberfläche ein:

1. Dashboard bearbeiten (Stift-Symbol oben rechts) → **+ Karte hinzufügen**.
2. Ganz unten in der Liste nach **„D-Link Switch"** suchen – alle 5 Karten erscheinen dort
   mit Name und Beschreibung.
3. Karte auswählen → es öffnet sich der Editor mit Eingabefeldern statt YAML.
4. Ganz oben **„Gerät"** auswählen: Wähle das HA-Gerät deiner DGS-1210-Integration.
   Die Karte durchsucht dann automatisch alle Entitäten dieses Geräts, erkennt anhand
   von Portnummer + Signalart (Link/Speed/Traffic in/out) und PoE im Namen, welche
   Entität zu welchem Port gehört, und trägt **Anzahl Ports**, alle Port-Entitäten und
   den PoE-Sensor selbst ein. Das funktioniert zuverlässig, wenn deine Integration
   Entitäten wie „Port 1 link", „Port 1 speed", „Port 1 traffic in/out" o.ä. benennt.
5. Ergebnis prüfen und bei Bedarf einzelne Felder manuell korrigieren:
   - **Anzahl Ports** anpassen, falls falsch erkannt.
   - Pro Port: Name (optional), Link-, Speed-, Traffic-in/-out-Entität über den
     Entity-Picker ändern.
   - **PoE-Leistungssensor**: bei Bedarf manuell überschreiben (bei Portübersicht und
     Zusammenfassung).
6. Speichern – fertig, kein YAML nötig.

Wenn die Auto-Erkennung nichts oder etwas Falsches findet (z.B. weil deine Integration
andere Bezeichnungen verwendet), lässt du das Gerätefeld einfach leer und füllst die
Port-Felder wie gehabt manuell per Entity-Picker aus.

Erhöhst du **Anzahl Ports** nachträglich, erscheinen unten neue leere Portblöcke zum
Ausfüllen; bereits ausgefüllte Ports bleiben erhalten.

## Voraussetzung

Diese Karten zeigen nur Daten an, die deine bestehende DGS-1210-Integration bereits
als Entitäten in Home Assistant bereitstellt (z.B. `binary_sensor.dgs1210_port_1_link`,
`sensor.dgs1210_port_1_speed`, `sensor.dgs1210_port_1_traffic_in`, `sensor.dgs1210_port_1_traffic_out`,
`sensor.dgs1210_poe_power`). Da jede Integration eigene Entity-IDs vergibt, musst du
diese einmalig in der Karten-Konfiguration eintragen (siehe unten).

## 1. Portübersicht — `dlink-switch-card`

Volle Tabelle wie im bisherigen Dashboard, aber mit Icons/Farben für Link-Status.

Der grafische Editor (siehe oben) erzeugt automatisch eine explizite `ports:`-Liste,
in der jeder Port seine eigenen Entitäten hat – kein gemeinsames Namensmuster nötig:

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
  - port: 2
    name: NAS
    link: binary_sensor.dgs1210_port_2_link
    speed: sensor.dgs1210_port_2_speed
    traffic_in: sensor.dgs1210_port_2_traffic_in
    traffic_out: sensor.dgs1210_port_2_traffic_out
compact: false   # true = nur Link + Speed, ohne Traffic-Zeilen
```

Alternativ (nur per YAML, nicht über den Editor) geht es auch per Entity-Vorlage, falls
alle Ports demselben Namensmuster folgen (`{port}` wird durch die Portnummer ersetzt):

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

## 2. Port-Grid — `dlink-ports-grid-card`

Kompakte Kachel-Ansicht (ein Blick reicht) — grün = verbunden, grau = getrennt,
darunter die Geschwindigkeit. Klick auf eine Kachel öffnet die More-Info.

```yaml
type: custom:dlink-ports-grid-card
title: Portstatus
port_count: 10
entities:
  link: binary_sensor.dgs1210_port_{port}_link
  speed: sensor.dgs1210_port_{port}_speed
```

## 3. Einzelner Port — `dlink-port-card`

Für einen besonders wichtigen Port (z.B. den Uplink), den du prominent auf dem
Dashboard sehen willst.

```yaml
type: custom:dlink-port-card
name: Uplink zum Router
link: binary_sensor.dgs1210_port_1_link
speed: sensor.dgs1210_port_1_speed
traffic_in: sensor.dgs1210_port_1_traffic_in
traffic_out: sensor.dgs1210_port_1_traffic_out
```

## 4. PoE-Verbrauch — `dlink-poe-card`

Große Anzeige mit Auslastungsbalken relativ zum PoE-Budget deines Switches (z.B.
78 W bei einer DGS-1210-10P/ME). Farbe wechselt bei Warn-/Kritisch-Schwelle.

```yaml
type: custom:dlink-poe-card
name: PoE-Leistungsverbrauch
entity: sensor.dgs1210_poe_power
max_power: 78
warn_percent: 70
critical_percent: 90
```

`max_power` ist optional — ohne diesen Wert wird nur die aktuelle Leistung ohne
Balken angezeigt.

## 5. Zusammenfassung — `dlink-switch-summary-card`

Eine schlanke Glance-Karte fürs Haupt-Dashboard: wie viele Ports verbunden sind,
Summe des ein-/ausgehenden Traffics über alle Ports sowie PoE-Verbrauch.

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

> Hinweis: Die Traffic-Summe geht davon aus, dass alle Traffic-Sensoren dieselbe
> Einheit verwenden (z.B. GB), da direkt addiert wird.

## Gemeinsame Optionen

Alle Karten mit Port-Liste unterstützen zusätzlich:

- `connected_states`: Liste von Zustandswerten, die als "verbunden" gelten
  (Standard: `["on", "connected", "verbunden", "up", "true"]`). Nützlich, falls
  deine Integration den Link-Status als `sensor` statt `binary_sensor` mit anderen
  Textwerten liefert.

## Lizenz

MIT
