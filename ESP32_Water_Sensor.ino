/*
 * ESP32-C6 Water Quality Sensor
 * Hardware: ESP32-C6 + TDS Sensor (GPIO1) + MPU6050 (I2C) + RGB LEDs
 * 
 * Features:
 * - TDS (Total Dissolved Solids) measurement
 * - MPU6050 accelerometer for vibration detection
 * - RGB LED status indicators
 * - Serial output with JSON data format
 * 
 * Water Quality Thresholds:
 * - Clean: ≤ 300 ppm TDS
 * - Unsafe: 300-400 ppm TDS  
 * - Extremely Unsafe: ≥ 500 ppm TDS
 * 
 * Connect to React Native app via Bluetooth for real-time monitoring
 */

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

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

// Global variables
Adafruit_MPU6050 mpu;
unsigned long lastMeasurement = 0;
float currentTDS = 0.0;
bool mpuAvailable = false;

// Water quality status
enum WaterQuality {
  CLEAN,
  UNSAFE,
  EXTREMELY_UNSAFE
};

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  Serial.println("ESP32-C6 Water Quality Sensor Starting...");
  
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
  
  // Startup LED sequence
  startupSequence();
  
  Serial.println("System ready for water quality monitoring");
  Serial.println("JSON format: {\"tds\":XXX,\"quality\":\"status\",\"vibration\":XXX,\"timestamp\":XXX}");
}

void loop() {
  // Check if it's time for a new measurement
  if (millis() - lastMeasurement >= MEASUREMENT_INTERVAL) {
    updateWaterQualityReadings();
    lastMeasurement = millis();
  }
  
  delay(100); // Small delay to prevent excessive CPU usage
}

void updateWaterQualityReadings() {
  // Read TDS sensor
  currentTDS = readTDSSensor();
  
  // Determine water quality
  WaterQuality quality = getWaterQuality(currentTDS);
  
  // Read vibration data
  float vibration = 0.0;
  if (mpuAvailable) {
    vibration = readVibration();
  }
  
  // Update LED status based on water quality
  updateStatusLED(quality);
  
  // Output JSON data to serial
  outputJSON(currentTDS, quality, vibration);
  
  // Debug output
  Serial.print("TDS: ");
  Serial.print(currentTDS);
  Serial.print(" ppm, Quality: ");
  Serial.print(getQualityString(quality));
  if (mpuAvailable) {
    Serial.print(", Vibration: ");
    Serial.print(vibration);
  }
  Serial.println();
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
  if (!mpuAvailable) return 0.0;
  
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

void updateStatusLED(WaterQuality quality) {
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

void setLED(int red, int green, int blue) {
  analogWrite(LED_RED_PIN, red);
  analogWrite(LED_GREEN_PIN, green);
  analogWrite(LED_BLUE_PIN, blue);
}

void outputJSON(float tds, WaterQuality quality, float vibration) {
  Serial.print("{\"tds\":");
  Serial.print(tds, 1);
  Serial.print(",\"quality\":\"");
  Serial.print(getQualityString(quality));
  Serial.print("\",\"vibration\":");
  Serial.print(vibration, 2);
  Serial.print(",\"timestamp\":");
  Serial.print(millis());
  Serial.println("}");
}

void startupSequence() {
  // Red
  setLED(255, 0, 0);
  delay(300);
  
  // Green  
  setLED(0, 255, 0);
  delay(300);
  
  // Blue
  setLED(0, 0, 255);
  delay(300);
  
  // Off
  setLED(0, 0, 0);
  delay(300);
  
  Serial.println("Startup sequence complete");
}