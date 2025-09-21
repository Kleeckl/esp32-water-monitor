/*
 * ESP32 Water Quality Sensor - PlatformIO Version
 * 
 * This code creates a BLE server that sends real water quality sensor data 
 * from TDS sensor and MPU6050 accelerometer to your React Native Water Testing app.
 * 
 * Compatible with: XIAO ESP32 C6, ESP32 DevKit, ESP32-S3, etc.
 * 
 * Hardware Connections:
 * - TDS Sensor Signal -> GPIO1
 * - MPU6050 SDA -> GPIO21 (or board default)
 * - MPU6050 SCL -> GPIO22 (or board default)
 * - Green LED -> D9
 * - Yellow LED -> D8  
 * - Red LED -> D3
 * - VCC -> 3.3V, GND -> GND
 * 
 * To upload with PlatformIO:
 * 1. Connect ESP32 to computer via USB
 * 2. Run: pio run -t upload
 * 3. Monitor serial output: pio device monitor
 * 4. Device appears as "ESP32-WaterSensor" when scanning
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// BLE UUIDs for water quality service (must match React Native app)
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-cba987654321"

// Hardware pin definitions (compatible with most ESP32 boards)
#define TDS_PIN 1          // GPIO1 for TDS sensor (analog input)
#define LED_GREEN  2       // GPIO2 - Green LED  
#define LED_YELLOW 4       // GPIO4 - Yellow LED
#define LED_RED    5       // GPIO5 - Red LED

// TDS sensor parameters
const float VREF = 3.3;
const int ADC_RES = 4095;
const float sensorTemperature = 25.0;  // Default temperature for TDS compensation

// Water quality thresholds  
const float TDSCLEAN_THRESHOLD = 300.0;    // ppm
const float TDSDIRTY_THRESHOLD = 400.0;    // ppm  
const float TDSXTREME_THRESHOLD = 500.0;   // ppm
const float VIB_THRESHOLD = 1.5;           // m/s²

// Sensor objects
Adafruit_MPU6050 mpu;

// BLE objects
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Water quality sensor variables (from real sensors)
float pH = 7.0;              // Will be simulated for now
float temperature = 22.0;    // From MPU6050
float tds = 150.0;           // From TDS sensor  
float turbidity = 2.0;       // Will be simulated for now
float vibration = 0.0;       // From MPU6050 accelerometer
bool vibrationDetected = false;
String waterStatus = "unknown";

unsigned long lastReading = 0;

// BLE Server Callbacks
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device connected!");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device disconnected!");
    }
};

// Function declarations
void updateWaterQualityReadings();
String generateWaterQualityJSON();

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Starting ESP32 Water Quality Sensor with Real Sensors...");
  Serial.println("PlatformIO Version");

  // Initialize LED pins
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  
  // Turn off all LEDs initially
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  // Initialize MPU6050
  Wire.begin();
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip!");
    // Flash red LED to indicate error
    for(int i = 0; i < 5; i++) {
      digitalWrite(LED_RED, HIGH);
      delay(200);
      digitalWrite(LED_RED, LOW);
      delay(200);
    }
    while (1) {
      Serial.println("MPU6050 not found - check wiring!");
      delay(1000);
    }
  }
  
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  Serial.println("MPU6050 initialized successfully.");

  // Create the BLE Device
  BLEDevice::init("ESP32-WaterSensor"); // Device name for scanning

  // Create the BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create a BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  // Add a descriptor for notifications
  pCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  
  Serial.println("Water Quality Sensor is now advertising...");
  Serial.println("Device name: ESP32-WaterSensor");
  Serial.println("Service UUID: " + String(SERVICE_UUID));
  Serial.println("System ready. Monitoring water quality...");
  
  // Green LED indicates successful initialization
  digitalWrite(LED_GREEN, HIGH);
  delay(1000);
  digitalWrite(LED_GREEN, LOW);
}

void loop() {
  // Update water quality readings every 3 seconds
  if (millis() - lastReading > 3000) {
    updateWaterQualityReadings();
    lastReading = millis();
  }

  // Send data to connected device
  if (deviceConnected) {
    String waterData = generateWaterQualityJSON();
    pCharacteristic->setValue(waterData.c_str());
    pCharacteristic->notify();
    Serial.println("Sent: " + waterData);
  }

  // Handle reconnection
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // Give bluetooth stack time to reset
    pServer->startAdvertising();
    Serial.println("Restarting advertising...");
    oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delay(1000); // Update every second
}

// Read real sensor data
void updateWaterQualityReadings() {
  // === MPU6050 Accelerometer (Vibration Detection) ===
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);

  float ax = accel.acceleration.x;
  float ay = accel.acceleration.y;
  float az = accel.acceleration.z;

  // Calculate vibration magnitude (remove gravity)
  vibration = sqrt(ax * ax + ay * ay + az * az) - 9.8;
  vibrationDetected = abs(vibration) > VIB_THRESHOLD;

  // Get temperature from MPU6050
  temperature = temp.temperature;

  // === TDS Sensor (Water Quality) ===
  int adcValue = analogRead(TDS_PIN);
  float voltage = (float)adcValue * VREF / ADC_RES;
  float compensation = 1.0 + 0.02 * (sensorTemperature - 25.0);
  float vComp = voltage / compensation;

  tds = (133.42 * pow(vComp, 3) - 255.86 * pow(vComp, 2) + 857.39 * vComp) * 0.5;
  
  // Constrain TDS to reasonable range
  tds = constrain(tds, 0, 2000);
  
  // === Water Quality Assessment ===
  if (tds <= TDSCLEAN_THRESHOLD && !vibrationDetected) {
    waterStatus = "clean";
  } else if (tds <= TDSDIRTY_THRESHOLD && tds > TDSCLEAN_THRESHOLD && !vibrationDetected) {
    waterStatus = "unsafe";
  } else if (tds >= TDSXTREME_THRESHOLD) {
    waterStatus = "extremely_unsafe";
  } else if (vibrationDetected) {
    waterStatus = "vibration_detected";
  }

  // === LED Status Indicators ===
  // Turn off all LEDs first
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  // Set LED based on water status
  if (waterStatus == "clean") {
    digitalWrite(LED_GREEN, HIGH);
  } else if (waterStatus == "unsafe") {
    digitalWrite(LED_YELLOW, HIGH);
  } else if (waterStatus == "extremely_unsafe") {
    digitalWrite(LED_RED, HIGH);
  } else if (waterStatus == "vibration_detected") {
    // Flash yellow for vibration
    digitalWrite(LED_YELLOW, (millis() / 500) % 2);
  }

  // === pH and Turbidity (simulated for now) ===
  // These can be replaced with real sensors if available
  pH = 7.0 + (sin(millis() / 15000.0) * 0.8) + (random(-10, 10) / 100.0);
  turbidity = 2.0 + (sin(millis() / 18000.0) * 1.5) + (random(-30, 30) / 100.0);
  
  pH = constrain(pH, 6.0, 9.0);
  turbidity = constrain(turbidity, 0.1, 10.0);

  // === Serial Output for Debugging ===
  Serial.print("TDS: "); Serial.print(tds); Serial.print(" ppm");
  Serial.print(" | Vibration: "); Serial.print(vibration, 2); Serial.print(" m/s²");
  Serial.print(" | Vibration Detected: "); Serial.print(vibrationDetected ? "YES" : "NO");
  Serial.print(" | Temperature: "); Serial.print(temperature, 1); Serial.print("°C");
  Serial.print(" | Water Status: "); Serial.println(waterStatus);
}

// Generate JSON data compatible with React Native app
String generateWaterQualityJSON() {
  String jsonData = "{";
  jsonData += "\"pH\":" + String(pH, 2) + ",";
  jsonData += "\"temperature\":" + String(temperature, 1) + ",";
  jsonData += "\"tds\":" + String(tds, 1) + ",";
  jsonData += "\"turbidity\":" + String(turbidity, 2) + ",";
  jsonData += "\"vibration\":" + String(vibration, 2) + ",";
  jsonData += "\"vibrationDetected\":" + String(vibrationDetected ? "true" : "false") + ",";
  jsonData += "\"waterStatus\":\"" + waterStatus + "\",";
  jsonData += "\"timestamp\":\"" + String(millis()) + "\",";
  jsonData += "\"deviceId\":\"ESP32-WaterSensor\",";
  jsonData += "\"status\":\"active\"";
  jsonData += "}";
  return jsonData;
}