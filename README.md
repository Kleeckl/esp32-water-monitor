# ESP32 Water Quality Monitor

A comprehensive water quality monitoring system using ESP32-C6 with Bluetooth Low Energy (BLE) and a React Native mobile app.

## 🌊 Project Overview

This project combines hardware sensors with a mobile application to provide real-time water quality monitoring and compliance tracking. The system measures Total Dissolved Solids (TDS) and vibration data, with intelligent baseline tracking and maintenance alerts.

## 🚀 Features

### Hardware (ESP32-C6)
- **TDS Sensor**: Real-time water quality measurement (GPIO1)
- **MPU6050 Accelerometer**: Multi-axis vibration detection (I2C pins 6,7)
- **RGB LED Indicators**: Visual status feedback (GPIO2, 4, 5)
- **BLE Communication**: Wireless data transmission to mobile app
- **Auto-fallback**: Simulated vibration data when MPU6050 unavailable

### Mobile App (React Native)
- **Real-time Monitoring**: Live sensor data display
- **Water Quality Assessment**: TDS-based quality classification
- **Vibration Analytics**: Baseline tracking with 20% deviation alerts
- **Visual Charts**: Bar chart visualization of vibration trends
- **Compliance Tracking**: Water testing checklist system
- **Smart Notifications**: Weekly testing reminders + post-rain alerts
- **Navigation-aware**: Automatic BLE cleanup when switching screens

## 📱 Technology Stack

- **Frontend**: React Native with Expo SDK 54
- **Hardware**: Arduino IDE compatible ESP32-C6
- **Communication**: Bluetooth Low Energy (BLE)
- **Development**: PlatformIO + Arduino IDE support
- **Sensors**: TDS sensor, MPU6050 accelerometer
- **Build System**: EAS Build for development builds

## 🛠️ Hardware Setup

### Components Required
- ESP32-C6 Development Board
- TDS Sensor (connected to GPIO1)
- MPU6050 Accelerometer (I2C: SDA=GPIO6, SCL=GPIO7)
- RGB LEDs (Red=GPIO2, Green=GPIO4, Blue=GPIO5)
- Breadboard and connecting wires

### ESP32 Libraries
```cpp
// Required Arduino Libraries
#include <WiFi.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <ArduinoJson.h>
```

## 📲 Mobile App Setup

### Prerequisites
- Node.js (v16 or later)
- Expo CLI
- Android/iOS device for testing

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/esp32-water-monitor.git
cd esp32-water-monitor

# Install dependencies
npm install

# Start development server
npx expo start --dev-client
```

### Development Build
```bash
# Build for Android
npx eas build --platform android --profile development

# Build for iOS  
npx eas build --platform ios --profile development
```

## 🔧 Configuration

### ESP32 Configuration
1. Open `ESP32_Water_Sensor_BLE.ino` in Arduino IDE
2. Select Board: "ESP32C6 Dev Module"
3. Upload to your ESP32-C6

### Mobile App Configuration
- Development builds support real BLE functionality
- Expo Go has limited BLE support - use development builds

## 📊 Water Quality Thresholds

| TDS Level | Quality | Status |
|-----------|---------|--------|
| ≤ 300 ppm | Clean | ✅ Safe |
| 300-400 ppm | Unsafe | ⚠️ Warning |
| ≥ 500 ppm | Extremely Unsafe | ❌ Critical |

## 🔔 Smart Notifications

- **Weekly Reminders**: Automated water testing notifications
- **Post-Rain Alerts**: Testing reminders after weather events
- **Maintenance Alerts**: 20% vibration deviation from baseline
- **Quality Warnings**: Real-time TDS threshold notifications

## 📈 Vibration Monitoring

- **Baseline Calculation**: Weekly statistical analysis
- **Multi-axis Tracking**: X, Y, Z acceleration monitoring
- **Deviation Alerts**: 20% threshold for maintenance needs
- **Visual Analytics**: Bar chart trends over time

## 🗂️ Project Structure

```
├── App.js                      # Main navigation container
├── ScreenTwo.js                # Primary sensor monitoring screen
├── VibrationStatsScreen.js     # Vibration analytics dashboard
├── WaterTestingChecklist.js    # Compliance tracking interface
├── BluetoothService.js         # BLE communication service
├── NotificationService.js      # Push notification management
├── ESP32_Water_Sensor_BLE.ino  # Arduino IDE ESP32 code
├── platformio.ini              # PlatformIO configuration
└── assets/                     # App icons and images
```

## 🐛 Troubleshooting

### Common Issues
1. **BLE Connection Failed**: Ensure development build (not Expo Go)
2. **ESP32 Upload Error**: Verify board selection "ESP32C6 Dev Module"
3. **JSON Parse Errors**: Handled automatically with fragment buffering
4. **Metro Server Issues**: Use LAN configuration for external devices

### Debug Features
- Comprehensive error handling with fallbacks
- JSON fragment recovery system
- Navigation-aware BLE cleanup
- Duplicate notification prevention

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- ESP32 Arduino Core community
- React Native BLE PLX library
- Expo team for development build support
- Adafruit for sensor libraries

## 📞 Support

For questions and support, please open an issue in the GitHub repository.

---

**Built with ❤️ for water quality monitoring and environmental safety**