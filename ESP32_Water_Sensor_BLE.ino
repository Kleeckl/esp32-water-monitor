/*
 * ESP32-C6 Water Quality Sensor with Bluetooth LE
 * Hardware: ESP32-C6 + TDS Sensor (GPIO1) + MPU6050 (I2C) + RGB LEDs
 * 
 * Features:
 * - TDS (Total Dissolved Solids) measurement
 * - MPU6050 accelerometer for vibration detection
 * - RGB LED status indicators
 * - Bluetooth LE server for React Native app connection
 * - Real-time data transmission
 * 
 * Water Quality Thresholds:
 * - Clean: ≤ 300 ppm TDS
 * - Unsafe: 300-400 ppm TDS  
 * - Extremely Unsafe: ≥ 500 ppm TDS
 * 
 * BLE Service UUID: 12345678-1234-1234-1234-123456789abc
 * Characteristic UUID: 87654321-4321-4321-4321-cba987654321
 */

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Hardware pin definitions for ESP32-C6
#define TDS_SENSOR_PIN 1    // Analog pin for TDS sensor
#define LED_RED_PIN 2       // Red LED pin
#define LED_GREEN_PIN 4     // Green LED pin  
#define LED_BLUE_PIN 5      // Blue LED pin

// I2C pins for ESP32-C6 (default pins)
#define SDA_PIN 6           // I2C Data pin
#define SCL_PIN 7           // I2C Clock pin

// Water quality thresholds (ppm)
#define CLEAN_THRESHOLD 300
#define UNSAFE_THRESHOLD 400
#define DANGEROUS_THRESHOLD 500

// Measurement settings
#define MEASUREMENT_INTERVAL 2000  // 2 seconds between readings
#define NUM_SAMPLES 10             // Number of samples to average

// BLE UUIDs
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-cba987654321"

// Global variables
Adafruit_MPU6050 mpu;
unsigned long lastMeasurement = 0;
float currentTDS = 0.0;
bool mpuAvailable = false;

// BLE variables
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Water quality status
enum WaterQuality {
  CLEAN,
  UNSAFE,
  EXTREMELY_UNSAFE
};

// BLE Server Callbacks
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("BLE Client Connected");
      // Flash blue LED to indicate connection
      setLED(0, 0, 255);
      delay(500);
      setLED(0, 0, 0);
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("BLE Client Disconnected");
      // Flash red LED to indicate disconnection
      setLED(255, 0, 0);
      delay(500);
      setLED(0, 0, 0);
    }
};

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  Serial.println("ESP32-C6 Water Quality Sensor with BLE Starting...");
  
  // Initialize LED pins
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);
  
  // Turn off all LEDs initially
  setLED(0, 0, 0);
  
  // Initialize I2C with custom pins for ESP32-C6
  Wire.begin(SDA_PIN, SCL_PIN);
  
  // Initialize MPU6050
  if (mpu.begin()) {
    Serial.println("MPU6050 initialized successfully");
    mpuAvailable = true;
    
    // Configure MPU6050 settings
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  } else {
    Serial.println("Warning: MPU6050 not found, continuing without accelerometer");
    mpuAvailable = false;
  }
  
  // Initialize BLE
  initializeBLE();
  
  // Startup LED sequence
  startupSequence();
  
  Serial.println("System ready for water quality monitoring");
  Serial.println("Waiting for BLE connection...");
}

void loop() {
  // Check if it's time for a new measurement
  if (millis() - lastMeasurement >= MEASUREMENT_INTERVAL) {
    updateWaterQualityReadings();
    lastMeasurement = millis();
  }
  
  // Handle BLE connection changes
  handleBLEConnection();
  
  delay(100); // Small delay to prevent excessive CPU usage
}

void initializeBLE() {
  // Create BLE Device
  BLEDevice::init("ESP32-Water-Sensor");
  
  // Create BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  // Create BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  // Create BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  // Add descriptor for notifications
  pCharacteristic->addDescriptor(new BLE2902());
  
  // Start the service
  pService->start();
  
  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
  BLEDevice::startAdvertising();
  
  Serial.println("BLE Service started, waiting for connections...");
}

void handleBLEConnection() {
  // Disconnecting
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // give the bluetooth stack time to get things ready
    pServer->startAdvertising(); // restart advertising
    Serial.println("Start advertising");
    oldDeviceConnected = deviceConnected;
  }
  
  // Connecting
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}

void updateWaterQualityReadings() {
  // Read TDS sensor
  currentTDS = readTDSSensor();
  
  // Determine water quality
  WaterQuality quality = getWaterQuality(currentTDS);
  
  // Read vibration data (includes simulation if MPU6050 not available)
  float vibration = readVibration();
  float xAxis, yAxis, zAxis;
  getVibrationAxes(xAxis, yAxis, zAxis);
  
  // Update LED status based on water quality
  updateStatusLED(quality);
  
  // Create JSON data
  String jsonData = createJSONData(currentTDS, quality, vibration, xAxis, yAxis, zAxis);
  
  // Output to serial
  Serial.println(jsonData);
  
  // Send via BLE if connected
  if (deviceConnected) {
    pCharacteristic->setValue(jsonData.c_str());
    pCharacteristic->notify();
    Serial.println("Data sent via BLE");
  }
  
  // Debug output
  Serial.print("TDS: ");
  Serial.print(currentTDS);
  Serial.print(" ppm, Quality: ");
  Serial.print(getQualityString(quality));
  Serial.print(", Vibration: ");
  Serial.print(vibration);
  Serial.print(" (X:");
  Serial.print(xAxis);
  Serial.print(", Y:");
  Serial.print(yAxis);  
  Serial.print(", Z:");
  Serial.print(zAxis);
  Serial.print(")");
  Serial.print(", BLE: ");
  Serial.println(deviceConnected ? "Connected" : "Disconnected");
}

float readTDSSensor() {
  long sum = 0;
  
  // Take multiple samples and average them
  for (int i = 0; i < NUM_SAMPLES; i++) {
    sum += analogRead(TDS_SENSOR_PIN);
    delay(10);
  }
  
  float average = sum / NUM_SAMPLES;
  
  // Convert analog reading to voltage (ESP32-C6: 3.3V reference, 12-bit ADC)
  float voltage = (average / 4095.0) * 3.3;
  
  // Convert voltage to TDS (calibration may need adjustment)
  // This is a basic conversion - you may need to calibrate for your specific sensor
  float tds = (133.42 * voltage * voltage * voltage 
               - 255.86 * voltage * voltage 
               + 857.39 * voltage) * 0.5;
  
  // Ensure TDS is not negative
  if (tds < 0) tds = 0;
  
  return tds;
}

WaterQuality getWaterQuality(float tds) {
  if (tds <= CLEAN_THRESHOLD) {
    return CLEAN;
  } else if (tds <= UNSAFE_THRESHOLD) {
    return UNSAFE;
  } else {
    return EXTREMELY_UNSAFE;
  }
}

String getQualityString(WaterQuality quality) {
  switch (quality) {
    case CLEAN:
      return "Clean";
    case UNSAFE:
      return "Unsafe";
    case EXTREMELY_UNSAFE:
      return "Extremely Unsafe";
    default:
      return "Unknown";
  }
}

float readVibration() {
  if (!mpuAvailable) {
    // Return simulated vibration data for testing when MPU6050 not connected
    // Generate small random vibration values between 0.0 and 0.5 m/s²
    static unsigned long lastUpdate = 0;
    static float simulatedVibration = 0.1;
    
    if (millis() - lastUpdate > 1000) { // Update every second
      simulatedVibration = random(5, 50) / 100.0; // 0.05 to 0.5
      lastUpdate = millis();
    }
    
    Serial.println("MPU6050 not available, using simulated vibration: " + String(simulatedVibration));
    return simulatedVibration;
  }
  
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  
  // Calculate magnitude of acceleration vector
  float magnitude = sqrt(a.acceleration.x * a.acceleration.x + 
                        a.acceleration.y * a.acceleration.y + 
                        a.acceleration.z * a.acceleration.z);
  
  // Subtract gravity (9.8 m/s²) to get movement acceleration
  float vibration = abs(magnitude - 9.8);
  
  return vibration;
}

// Get individual axis vibration data
void getVibrationAxes(float &xAxis, float &yAxis, float &zAxis) {
  if (!mpuAvailable) {
    // Generate simulated axis data
    static unsigned long lastAxisUpdate = 0;
    static float simX = 0.05, simY = 0.05, simZ = 0.05;
    
    if (millis() - lastAxisUpdate > 1000) {
      simX = random(1, 25) / 100.0; // 0.01 to 0.25
      simY = random(1, 25) / 100.0; // 0.01 to 0.25  
      simZ = random(1, 25) / 100.0; // 0.01 to 0.25
      lastAxisUpdate = millis();
    }
    
    xAxis = simX;
    yAxis = simY;
    zAxis = simZ;
    return;
  }
  
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  
  // Get raw acceleration values and convert to vibration
  xAxis = abs(a.acceleration.x);
  yAxis = abs(a.acceleration.y);
  zAxis = abs(a.acceleration.z - 9.8); // Subtract gravity from Z axis
}

void updateStatusLED(WaterQuality quality) {
  // Don't override BLE connection indicators
  if (!deviceConnected) {
    switch (quality) {
      case CLEAN:
        setLED(0, 255, 0);  // Green - water is clean
        break;
      case UNSAFE:
        setLED(255, 165, 0); // Orange - water is unsafe
        break;
      case EXTREMELY_UNSAFE:
        setLED(255, 0, 0);   // Red - water is extremely unsafe
        break;
    }
  }
}

void setLED(int red, int green, int blue) {
  analogWrite(LED_RED_PIN, red);
  analogWrite(LED_GREEN_PIN, green);
  analogWrite(LED_BLUE_PIN, blue);
}

String createJSONData(float tds, WaterQuality quality, float vibration, float xAxis, float yAxis, float zAxis) {
  String json = "{";
  json += "\"tds\":" + String(tds, 1);
  json += ",\"quality\":\"" + getQualityString(quality) + "\"";
  json += ",\"vibration\":" + String(vibration, 3);
  json += ",\"xAxis\":" + String(xAxis, 3);
  json += ",\"yAxis\":" + String(yAxis, 3);
  json += ",\"zAxis\":" + String(zAxis, 3);
  json += ",\"timestamp\":" + String(millis());
  json += ",\"deviceId\":\"ESP32-Water-Sensor\"";
  json += ",\"batteryLevel\":100";  // Add battery level if you have battery monitoring
  json += "}";
  return json;
}

void startupSequence() {
  Serial.println("Starting initialization sequence...");
  
  // Red
  setLED(255, 0, 0);
  delay(300);
  
  // Green  
  setLED(0, 255, 0);
  delay(300);
  
  // Blue
  setLED(0, 0, 255);
  delay(300);
  
  // Purple (BLE ready)
  setLED(128, 0, 128);
  delay(500);
  
  // Off
  setLED(0, 0, 0);
  delay(300);
  
  Serial.println("Startup sequence complete - BLE advertising started");
}