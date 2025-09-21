# ESP32 Water Quality Monitor

A comprehensive water quality monitoring system using ESP32-C6 with Bluetooth Low Energy (BLE) and a React Native mobile app.

## Project Overview

This project combines hardware sensors with a mobile application to provide real-time water quality monitoring and compliance tracking. The system measures Total Dissolved Solids (TDS) and vibration data, with intelligent baseline tracking and maintenance alerts.

## Features

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

## Technology Stack

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

```

## Water Quality Thresholds

| TDS Level | Quality | Status |
|-----------|---------|--------|
| ≤ 300 ppm | Clean | ✅ Safe |
| 300-400 ppm | Unsafe | ⚠️ Warning |
| ≥ 500 ppm | Extremely Unsafe | ❌ Critical |

## Smart Notifications

- **Weekly Reminders**: Automated water testing notifications
- **Post-Rain Alerts**: Testing reminders after weather events
- **Maintenance Alerts**: 20% vibration deviation from baseline
- **Quality Warnings**: Real-time TDS threshold notifications

## Vibration Monitoring

- **Baseline Calculation**: Weekly statistical analysis
- **Multi-axis Tracking**: X, Y, Z acceleration monitoring
- **Deviation Alerts**: 20% threshold for maintenance needs
- **Visual Analytics**: Bar chart trends over time

```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- ESP32 Arduino Core community
- React Native BLE PLX library
- Expo team for development build support
- Adafruit for sensor libraries

