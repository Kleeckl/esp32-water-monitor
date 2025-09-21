// Simulated Bluetooth Service for Expo Go testing
// This provides the same interface as BluetoothService but with simulated data

import { Alert } from 'react-native';

class SimulatedBluetoothService {
  constructor() {
    this.device = null;
    this.isConnected = false;
    this.subscribers = [];
    this.simulationInterval = null;
    this.lastConnectionEvent = 0;
  }

  // Simulate permission request
  async requestPermissions() {
    console.log('Simulated: Permissions granted');
    return true;
  }

  // Simulate device scanning
  async scanForDevices(onDeviceFound) {
    console.log('Simulated: Starting device scan...');
    
    // Simulate finding devices after a delay
    setTimeout(() => {
      const simulatedDevices = [
        {
          id: 'sim-esp32-001',
          name: 'ESP32-Sensor (Simulated)',
          localName: 'ESP32-Sensor'
        },
        {
          id: 'sim-esp32-002', 
          name: 'XIAO-ESP32-C6 (Simulated)',
          localName: 'XIAO-ESP32-C6'
        }
      ];

      simulatedDevices.forEach((device, index) => {
        setTimeout(() => {
          onDeviceFound(device);
        }, (index + 1) * 1000);
      });
    }, 1000);
  }

  stopScan() {
    console.log('Simulated: Stopped scanning');
  }

  // Simulate device connection
  async connectToDevice(device) {
    try {
      console.log('Simulated: Connecting to device:', device.name);
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.device = {
        ...device,
        id: device.id,
        name: device.name
      };
      
      this.isConnected = true;
      console.log('Simulated: Connected successfully');
      
      // Debounce connection events to prevent multiple alerts
      const now = Date.now();
      if (now - this.lastConnectionEvent > 2000) {
        this.notifySubscribers('connected', { device: this.device });
        this.lastConnectionEvent = now;
      }
      
      return this.device;
    } catch (error) {
      console.error('Simulated connection error:', error);
      Alert.alert('Connection Error', `Failed to connect: ${error.message}`);
      throw error;
    }
  }

  // Simulate reading sensor data
  async readSensorData(serviceUUID, characteristicUUID) {
    if (!this.device || !this.isConnected) {
      throw new Error('No device connected');
    }

    try {
      // Generate simulated sensor data
      const simulatedData = this.generateSensorData();
      
      console.log('Simulated: Sensor data read:', simulatedData);
      this.notifySubscribers('dataReceived', { data: simulatedData });
      
      return simulatedData;
    } catch (error) {
      console.error('Simulated read error:', error);
      throw error;
    }
  }

  // Simulate subscribing to notifications
  async subscribeToNotifications(serviceUUID, characteristicUUID, callback) {
    if (!this.device || !this.isConnected) {
      throw new Error('No device connected');
    }

    try {
      console.log('Simulated: Subscribing to notifications');
      
      // Start sending simulated data every 2 seconds
      this.simulationInterval = setInterval(() => {
        const data = this.generateSensorData();
        console.log('Simulated notification:', data);
        callback(data);
        this.notifySubscribers('dataReceived', { data });
      }, 2000);

    } catch (error) {
      console.error('Simulated subscription error:', error);
      throw error;
    }
  }

  // Stop notifications
  stopNotifications() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      console.log('Simulated: Stopped notifications');
    }
  }

  // Generate realistic sensor data
  generateSensorData() {
    const timestamp = Date.now();
    const temperature = (25 + Math.sin(timestamp / 10000) * 5).toFixed(2);
    const humidity = (60 + Math.cos(timestamp / 8000) * 20).toFixed(2);
    const counter = Math.floor(timestamp / 2000) % 1000;
    
    return JSON.stringify({
      temperature: parseFloat(temperature),
      humidity: parseFloat(humidity),
      counter: counter,
      timestamp: timestamp,
      source: 'simulated'
    });
  }

  // Simulate disconnect
  async disconnect() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    if (this.device) {
      console.log('Simulated: Disconnected from device');
      this.isConnected = false;
      this.device = null;
      this.notifySubscribers('disconnected', {});
    }
  }

  // Subscribe to service events
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  notifySubscribers(event, data) {
    this.subscribers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Subscriber callback error:', error);
      }
    });
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      device: this.device,
      deviceName: this.device?.name || null,
      deviceId: this.device?.id || null
    };
  }

  // Request a single sensor reading (for manual tests)
  async requestSingleReading() {
    if (!this.isConnected) {
      throw new Error('Not connected to device');
    }

    console.log('Simulated: Requesting single sensor reading...');
    
    // Simulate a fresh reading with slight delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const reading = {
      pH: (6.5 + Math.random() * 2).toFixed(2),
      temperature: (20 + Math.random() * 10).toFixed(1),
      tds: Math.floor(100 + Math.random() * 200),
      turbidity: (Math.random() * 5).toFixed(2),
      conductivity: (200 + Math.random() * 300).toFixed(1),
      timestamp: new Date().toISOString()
    };

    console.log('Simulated: Single reading collected:', reading);
    return reading;
  }

  // Cleanup
  destroy() {
    this.disconnect();
    this.subscribers = [];
  }
}

// Create singleton instance
const simulatedBluetoothService = new SimulatedBluetoothService();
export default simulatedBluetoothService;