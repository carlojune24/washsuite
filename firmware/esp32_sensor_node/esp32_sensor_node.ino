/*
 * WashSuite ESP32 sensor node -- reads 4x TEMT6000 light sensors and reports them to the
 * WashSuite desktop app, which binds each channel to a specific washer/dryer (see Settings ->
 * Machines & Sensors in the app). One ESP32 always covers exactly 4 machines -- fixed, not
 * configurable -- because GPIO32/33/34/35 are the only 4 pins on this board that are safe to
 * read as analog input while WiFi is connected (ADC1). Every other GPIO this board's expansion
 * header exposes is either ADC2 (shared with -- and unreliable under -- the WiFi driver) or has
 * no ADC hardware at all, so there's no way to squeeze a 5th channel out of a single board. A
 * shop needing more than 4 machines runs a second board; each shows up as its own device in the
 * app and binds independently.
 *
 * Wiring (classic ESP32 Dev Module), also printed to Serial at boot (see printWiringGuide()):
 *   TEMT6000 Channel A: VCC -> 3.3V, GND -> GND, OUT -> GPIO34
 *   TEMT6000 Channel B: VCC -> 3.3V, GND -> GND, OUT -> GPIO35
 *   TEMT6000 Channel C: VCC -> 3.3V, GND -> GND, OUT -> GPIO32
 *   TEMT6000 Channel D: VCC -> 3.3V, GND -> GND, OUT -> GPIO33
 *
 * Optional bench-test status LEDs -- light up whenever that channel currently reads as "light
 * detected", so you can see sensor behavior at a glance without Serial Monitor or the app open.
 * Not required for normal operation. GPIO pins are 3.3V logic regardless of which power rail
 * (5V/3.3V) the board itself is running from -- no need to tap either supply pin for these,
 * just drive the GPIO directly through a resistor:
 *   Status LED A: GPIO25 -> ~220-330ohm resistor -> LED anode; LED cathode -> GND
 *   Status LED B: GPIO26 -> ~220-330ohm resistor -> LED anode; LED cathode -> GND
 *
 * WiFi setup -- no credentials in this file, on purpose (a hardcoded password here would sit in
 * plaintext in source control). On first boot, or whenever it can't connect with previously
 * saved credentials, this broadcasts its own temporary "WashSuite-Setup-XXXX" WiFi network.
 * Connect to that from a phone/laptop, the config portal pops up automatically (or browse to
 * 192.168.4.1), pick your real WiFi and enter its password there (and optionally a manual App
 * IP -- see below). It's saved to flash and used automatically on every boot after that.
 *
 * To reprovision later (new WiFi network, wrong password): open Serial Monitor, type "reset"
 * into the send box and hit Enter -- wipes saved credentials and brings the setup portal back
 * up. This is the reliable option; holding the board's BOOT button at power-on is *supposed* to
 * do the same thing, but whether that pin is actually wired to a working button varies by
 * board, so the serial command is the one to trust.
 *
 * Arduino IDE setup:
 *   - Boards Manager: install "esp32 by Espressif Systems" (adds WiFi.h/ESPmDNS.h/HTTPClient.h,
 *     no separate installs needed for those).
 *   - Library Manager: install "WiFiManager" by tzapu.
 *   - Board: "ESP32 Dev Module" (or your specific board) -- default settings are fine.
 *   - Open Serial Monitor at 115200 baud to watch WiFi/mDNS/POST status.
 *
 * By default the ESP32 doesn't need to know the app's IP directly -- it resolves
 * "washsuite.local" via mDNS (the hostname the app advertises on startup, desktop only -- see
 * below), re-resolving automatically if a POST ever fails. The ingest port (4390) is a fixed
 * constant on both ends. If mDNS isn't working on your network, or WashSuite is running on an
 * Android tablet instead of the desktop (Android doesn't advertise over mDNS at all), the same
 * setup portal above also has a "WashSuite App IP" field -- leave it blank for auto (mDNS,
 * desktop only), or type in one of the addresses shown under Settings -> Machines & Sensors in
 * whichever app instance (PC or tablet) has that screen open, to skip mDNS entirely and always
 * post straight to that address.
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <Preferences.h>

// ---- Wiring / timing ---------------------------------------------------------
// Fixed channel/pin assignment -- see header comment for why this is 4 and not configurable.
const int CHANNEL_PINS[] = {34, 35, 32, 33};
const char CHANNEL_LETTERS[] = {'a', 'b', 'c', 'd'};
const int NUM_CHANNELS = 4;
// This board's other expansion-header grid pins -- ADC2 (shared with, and unreliable under, the
// WiFi driver) or no ADC hardware at all, so they're never offered as channel pins above.
const int UNUSABLE_GRID_PINS[] = {12, 13, 14, 25, 26, 27, 2, 15, 4, 16, 17, 5, 18, 19, 21, 22, 23};

const int STATUS_LED_A_PIN = 25; // optional -- lights up when channel A reads "light detected"
const int STATUS_LED_B_PIN = 26; // optional -- lights up when channel B reads "light detected"
const unsigned long POST_INTERVAL_MS = 1000;
const unsigned long MDNS_RETRY_INTERVAL_MS = 10000;
const int BOOT_BUTTON_PIN = 0; // hold low (pressed) during power-on to wipe saved WiFi creds

// Debug-only mirror of RUNNING_THRESHOLD in src/lib/machineStatus.tsx -- the two are independent
// constants and can drift out of sync; if you tune the real threshold in the app, update this
// too or the bench LEDs stop matching what the app actually decides.
const int STATUS_LED_THRESHOLD = 1500;

String appHost;         // resolved app IP, e.g. "192.168.1.42" -- empty until mDNS resolves it
String appHostOverride; // manually configured app IP from the setup portal -- empty means "use mDNS"
uint16_t appPort = 4390;
unsigned long lastPostAt = 0;
unsigned long lastMdnsAttemptAt = 0;
String deviceId;      // WiFi MAC address -- stable identity the app registers this board under
int smoothed[NUM_CHANNELS] = {-1, -1, -1, -1};

void setup() {
  Serial.begin(115200);
  analogReadResolution(12); // 0-4095

  pinMode(STATUS_LED_A_PIN, OUTPUT);
  pinMode(STATUS_LED_B_PIN, OUTPUT);

  // Deliberately NOT setting an internal pull-down on any channel pin (tried on C/D, reverted):
  // a TEMT6000's OUT pin is itself a resistor-divider node (onboard resistor to GND + the
  // phototransistor's path to VCC) -- stacking a second pull resistor on top of that, even the
  // ESP32's own internal one, skews the divider math and corrupts real readings the moment a
  // sensor is actually wired to that channel, which defeats the point. An unwired channel's
  // floating noise (normally in the low hundreds, well under STATUS_LED_THRESHOLD) is the lesser
  // problem -- if a channel is going to stay permanently unused, an external ~10k ohm resistor
  // from that pin to GND is the correct fix; leave wired-up channels alone entirely.
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  bool forceReprovision = bootButtonHeldSinceStartup();
  if (forceReprovision) {
    Serial.println("BOOT button held -- wiping saved WiFi credentials");
  }

  connectWifi(forceReprovision);
  deviceId = WiFi.macAddress();
  Serial.printf("Device ID: %s\n", deviceId.c_str());
  printWiringGuide();

  if (!MDNS.begin("washsuite-sensor")) {
    Serial.println("mDNS init failed");
  }

  resolveAppAddress();
}

void loop() {
  checkRuntimeReprovisionHold();
  checkSerialReprovisionCommand();

  if (WiFi.status() != WL_CONNECTED) {
    // WiFiManager already handled first-time setup in setup() -- a drop here is a transient
    // disconnect (router reboot, signal loss), so just let the station driver retry rather
    // than bringing the setup portal back up.
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (appHost.isEmpty() && millis() - lastMdnsAttemptAt > MDNS_RETRY_INTERVAL_MS) {
    resolveAppAddress();
  }

  if (!appHost.isEmpty() && millis() - lastPostAt > POST_INTERVAL_MS) {
    postReading();
    lastPostAt = millis();
  }
}

void wipeWifiAndRestart() {
  WiFiManager wm;
  wm.resetSettings();
  delay(500);
  ESP.restart();
}

// Type "reset" into Serial Monitor's send box (and hit Enter/Send) anytime to wipe saved WiFi
// credentials and bring the setup portal back up. Doesn't depend on any physical button, so
// it works regardless of what pin your board's BOOT/FLASH button turns out to be wired to (or
// whether it's wired to anything meaningful at all).
void checkSerialReprovisionCommand() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.equalsIgnoreCase("reset")) {
    Serial.println("Got \"reset\" -- wiping saved WiFi credentials and restarting");
    wipeWifiAndRestart();
  }
}

// Lets you reprovision WiFi anytime just by pressing and holding the button while the board is
// already running -- no power-cycle timing to fight. Also doubles as a wiring diagnostic: if
// nothing prints when you press and hold, that button isn't actually connected to
// BOOT_BUTTON_PIN (GPIO0) on this board and a different pin/button is needed.
unsigned long buttonPressedSince = 0; // 0 = not currently pressed
void checkRuntimeReprovisionHold() {
  bool pressed = digitalRead(BOOT_BUTTON_PIN) == LOW;

  if (pressed && buttonPressedSince == 0) {
    buttonPressedSince = millis();
    Serial.println("Button pin went LOW (pressed)");
  } else if (!pressed && buttonPressedSince != 0) {
    Serial.println("Button pin back HIGH (released)");
    buttonPressedSince = 0;
  }

  if (pressed && millis() - buttonPressedSince > 3000) {
    Serial.println("Held 3s -- wiping saved WiFi credentials and restarting");
    wipeWifiAndRestart();
  }
}

// A single instantaneous digitalRead() right at boot is too timing-sensitive -- setup() runs
// within a fraction of a second of power-up, so releasing the button even slightly early reads
// as "not pressed" and silently reconnects to the old network instead. Require it held for a
// full window instead, so timing doesn't matter as long as you keep holding through power-on.
bool bootButtonHeldSinceStartup() {
  const unsigned long HOLD_WINDOW_MS = 2000;
  unsigned long start = millis();
  while (millis() - start < HOLD_WINDOW_MS) {
    if (digitalRead(BOOT_BUTTON_PIN) == HIGH) return false; // released early -- not a real hold
    delay(20);
  }
  return true;
}

bool portalParamsSaved = false;
void onPortalParamsSaved() {
  portalParamsSaved = true; // only fires when the portal was actually shown and submitted --
                             // not on a silent reconnect using already-saved WiFi credentials
}

void connectWifi(bool forceReprovision) {
  WiFiManager wm;

  if (forceReprovision) {
    wm.resetSettings();
  }

  Preferences prefs;
  prefs.begin("washsuite", true); // read-only
  String savedAppIp = prefs.getString("app_ip", "");
  prefs.end();

  // Pre-filled with whatever's already saved, so reconfiguring shows the current value instead
  // of a blank field. 15 chars fits any IPv4 address ("255.255.255.255").
  WiFiManagerParameter appIpParam("app_ip", "WashSuite App IP (blank = auto via mDNS)", savedAppIp.c_str(), 15);
  wm.addParameter(&appIpParam);
  wm.setSaveParamsCallback(onPortalParamsSaved);

  // Unique-ish AP name per board (last 4 hex digits of the MAC) so provisioning multiple units
  // doesn't leave you guessing which "WashSuite-Setup" network belongs to which one.
  String apName = "WashSuite-Setup-" + WiFi.macAddress().substring(12);
  apName.replace(":", "");

  wm.setConfigPortalTimeout(180); // don't block forever if nobody's provisioning it right now
  Serial.printf("Connecting to saved WiFi, or starting setup portal \"%s\"...\n", apName.c_str());

  if (!wm.autoConnect(apName.c_str())) {
    Serial.println("Setup portal timed out with no connection -- restarting to try again");
    delay(1000);
    ESP.restart();
  }

  if (portalParamsSaved) {
    prefs.begin("washsuite", false);
    prefs.putString("app_ip", appIpParam.getValue());
    prefs.end();
    Serial.printf("Saved WashSuite App IP override: \"%s\"\n", appIpParam.getValue());
  }

  appHostOverride = savedAppIp;
  if (portalParamsSaved) appHostOverride = String(appIpParam.getValue());

  Serial.printf("Connected, IP: %s\n", WiFi.localIP().toString().c_str());
}

// Prints exactly which physical grid pin to wire each channel's TEMT6000 into -- called once at
// boot so this never has to be looked up by hand or kept in sync with the header comment above.
void printWiringGuide() {
  Serial.println("\n=== WashSuite wiring (4 machines, fixed) ===");
  for (int i = 0; i < NUM_CHANNELS; i++) {
    Serial.printf("Channel %c (Machine %d): TEMT6000 OUT -> expansion board pin D%d | VCC -> V | GND -> G\n",
                  CHANNEL_LETTERS[i], i + 1, CHANNEL_PINS[i]);
  }
  Serial.print("NOTE: every other grid pin on this board (");
  for (size_t i = 0; i < sizeof(UNUSABLE_GRID_PINS) / sizeof(UNUSABLE_GRID_PINS[0]); i++) {
    Serial.printf("D%d%s", UNUSABLE_GRID_PINS[i], i + 1 < sizeof(UNUSABLE_GRID_PINS) / sizeof(UNUSABLE_GRID_PINS[0]) ? ", " : "");
  }
  Serial.println(") is NOT usable for sensors (ADC2 or no ADC hardware at all). Leave them unwired.");
  Serial.println("NOTE: any of A-D not wired yet reads as floating noise (usually low hundreds, not");
  Serial.println("      0) -- normal, and no threat to STATUS_LED_THRESHOLD unless a channel is going");
  Serial.println("      to stay unused permanently, in which case add an external ~10k ohm pin-to-GND");
  Serial.println("      resistor. Do NOT add any pull resistor (internal or external) to a channel once");
  Serial.println("      its sensor is wired -- it skews the TEMT6000's own output divider and corrupts");
  Serial.println("      the reading.");
  Serial.println("=================================================\n");
}

void resolveAppAddress() {
  lastMdnsAttemptAt = millis();

  if (appHostOverride.length() > 0) {
    appHost = appHostOverride;
    Serial.printf("Using configured WashSuite App IP: %s:%u\n", appHost.c_str(), appPort);
    return;
  }

  Serial.println("Resolving washsuite.local via mDNS...");
  // Plain hostname (A record) resolution instead of _washsuite._tcp service/PTR browsing --
  // ESPmDNS's queryService() is the notoriously flaky part of this library across core
  // versions; queryHost() is the same mDNS resolver ESP32 OTA tooling relies on and is far
  // more reliably implemented. The port doesn't need discovering since it's a fixed constant
  // on both ends.
  IPAddress ip = MDNS.queryHost("washsuite", 3000);
  if (ip == IPAddress(0, 0, 0, 0)) {
    Serial.println("washsuite.local not found yet -- is the desktop app running?");
    return;
  }
  appHost = ip.toString();
  Serial.printf("Found WashSuite app at %s:%u\n", appHost.c_str(), appPort);
}

// Exponential smoothing (~25% new sample each read) so a jittery ADC value doesn't make the
// app's live-identify screen hard to read by eye while you cover/uncover a sensor.
int smooth(int previous, int sample) {
  if (previous < 0) return sample;
  return previous + (sample - previous) / 4;
}

void postReading() {
  String channelsJson = "{";
  for (int i = 0; i < NUM_CHANNELS; i++) {
    smoothed[i] = smooth(smoothed[i], analogRead(CHANNEL_PINS[i]));
    if (i > 0) channelsJson += ",";
    channelsJson += "\"" + String(CHANNEL_LETTERS[i]) + "\":" + String(smoothed[i]);
  }
  channelsJson += "}";

  // Only channels A/B have bench LEDs wired -- see header comment.
  digitalWrite(STATUS_LED_A_PIN, smoothed[0] > STATUS_LED_THRESHOLD ? HIGH : LOW);
  digitalWrite(STATUS_LED_B_PIN, smoothed[1] > STATUS_LED_THRESHOLD ? HIGH : LOW);

  HTTPClient http;
  String url = "http://" + appHost + ":" + String(appPort) + "/ingest";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_id\":\"" + deviceId + "\",\"channels\":" + channelsJson + "}";
  int status = http.POST(body);

  if (status <= 0) {
    Serial.printf("POST failed: %s -- will re-resolve app address\n", http.errorToString(status).c_str());
    appHost = ""; // the app's IP may have changed (DHCP renewal, restart) -- force a fresh lookup
  } else if (status != 204) {
    Serial.printf("POST returned unexpected status %d\n", status);
  }

  http.end();
}
