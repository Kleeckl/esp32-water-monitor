# ESP32 Water Quality Sensor - PlatformIO Project

This project creates a BLE-enabled water quality monitoring sensor using ESP32 C6, TDS sensor, and MPU6050 accelerometer. The sensor transmits real-time water quality data to a React Native mobile app via Bluetooth Low Energy.

## Hardware Requirements

- **ESP32 C6** (or compatible ESP32 board)
- **TDS Sensor** - for measuring Total Dissolved Solids in water
- **MPU6050** - 6-axis accelerometer/gyroscope for vibration detection
- **RGB LEDs** - for visual status indication
- **Resistors** - appropriate values for LEDs

## Hardware Connections

| Component | ESP32 Pin | Notes |
|-----------|-----------|-------|
| TDS Sensor Signal | GPIO1 | Analog input |
| MPU6050 SDA | GPIO21 | I2C Data (or board default) |
| MPU6050 SCL | GPIO22 | I2C Clock (or board default) |
| Green LED | D9 | Water is clean |
| Yellow LED | D8 | Water is unsafe |
| Red LED | D3 | Water is extremely unsafe |
| VCC | 3.3V | Power for all sensors |
| GND | GND | Common ground |

## Software Setup

### Prerequisites

1. **Install PlatformIO**: 
   - VS Code: Install PlatformIO IDE extension
   - CLI: `pip install platformio`

2. **Install required libraries** (automatically handled by platformio.ini):
   - Adafruit MPU6050
   - Adafruit Unified Sensor
   - Adafruit BusIO

### Building and Uploading

1. **Open project in PlatformIO**:
   ```bash
   cd /path/to/MyFirstApp
   pio run
   ```

2. **Build the project**:
   ```bash
   pio run
   ```

3. **Upload to ESP32**:
   ```bash
   pio run -t upload
   ```

4. **Monitor serial output**:
   ```bash
   pio device monitor
   ```

### Alternative Upload Methods

If you need to specify the upload port:

1. **Windows**: Uncomment and modify in `platformio.ini`:
   ```ini
   upload_port = COM3
   ```

2. **Linux/macOS**: 
   ```ini
   upload_port = /dev/ttyUSB0
   ```

## Features

### Water Quality Monitoring
- **TDS Measurement**: Real-time Total Dissolved Solids measurement
- **Temperature**: From MPU6050 built-in sensor
- **Vibration Detection**: Earthquake/movement detection using accelerometer
- **pH & Turbidity**: Currently simulated (can be replaced with real sensors)

### LED Status Indicators
- **Green**: Water is clean (TDS ≤ 300 ppm, no vibration)
- **Yellow**: Water is unsafe (TDS 300-400 ppm, no vibration)
- **Red**: Water is extremely unsafe (TDS ≥ 500 ppm)
- **Flashing Yellow**: Vibration detected

### BLE Communication
- **Device Name**: "ESP32-WaterSensor"
- **Service UUID**: `12345678-1234-1234-1234-123456789abc`
- **Characteristic UUID**: `87654321-4321-4321-4321-cba987654321`
- **Data Format**: JSON with all sensor readings

### JSON Data Structure

```json
{
  "pH": 7.2,
  "temperature": 22.5,
  "tds": 285.3,
  "turbidity": 1.8,
  "vibration": 0.15,
  "vibrationDetected": false,
  "waterStatus": "clean",
  "timestamp": "12345678",
  "deviceId": "ESP32-WaterSensor",
  "status": "active"
}
```

## Water Quality Thresholds

| Parameter | Threshold | Status |
|-----------|-----------|--------|
| TDS ≤ 300 ppm | Clean | Safe to drink |
| TDS 300-400 ppm | Unsafe | Needs treatment |
| TDS ≥ 500 ppm | Extremely Unsafe | Do not drink |
| Vibration > 1.5 m/s² | Vibration Detected | Earthquake/movement |

## Troubleshooting

### Common Issues

1. **MPU6050 not found**:
   - Check I2C wiring (SDA/SCL)
   - Verify 3.3V power supply
   - Red LED will flash 5 times if MPU6050 fails

2. **Upload fails**:
   - Check USB connection
   - Verify correct COM port
   - Press BOOT button while uploading (if required)

3. **BLE not advertising**:
   - Check serial monitor for "advertising" message
   - Restart ESP32
   - Ensure BLE is enabled on receiving device

### Serial Monitor Output

Normal operation shows:
```
Starting ESP32 Water Quality Sensor with Real Sensors...
PlatformIO Version
MPU6050 initialized successfully.
Water Quality Sensor is now advertising...
Device name: ESP32-WaterSensor
System ready. Monitoring water quality...
TDS: 285.3 ppm | Vibration: 0.15 m/s² | Vibration Detected: NO | Temperature: 22.5°C | Water Status: clean
```

## Board Configuration

The project supports multiple ESP32 C6 boards. Uncomment the appropriate section in `platformio.ini`:

- `esp32-c6-devkitc-1` (default)
- `seeed_xiao_esp32c6`
- `esp32-c6-devkitm-1`

## Integration with React Native App

This sensor is designed to work with the accompanying React Native water testing app. The app will:

1. Scan for "ESP32-WaterSensor" device
2. Connect via BLE
3. Receive real-time sensor data
4. Display water quality status
5. Provide testing compliance tracking

## Next Steps

1. **Calibrate sensors** using known reference solutions
2. **Add real pH sensor** to replace simulated readings
3. **Add turbidity sensor** for complete water quality analysis
4. **Implement data logging** for historical analysis
5. **Add WiFi connectivity** for remote monitoring

## Support

For issues related to:
- **Hardware**: Check wiring and power connections
- **Software**: Review serial monitor output
- **BLE**: Verify React Native app compatibility
- **Sensors**: Calibrate using reference standards