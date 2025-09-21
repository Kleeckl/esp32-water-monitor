import { Alert, PermissionsAndroid, Platform } from 'react-native';

// Try to import BLE manager with fallback
let BleManager;
try {
  BleManager = require('react-native-ble-plx').BleManager;
} catch (error) {
  console.log('🧪 react-native-ble-plx not available, using mock mode');
  BleManager = null;
}

class BluetoothService {
  constructor() {
    this.device = null;
    this.isConnected = false;
    this.subscribers = [];
    this.lastConnectionEvent = 0;
    this.manager = null;
    this.jsonBuffer = ''; // Buffer for incomplete JSON data
    this.isMonitoring = false; // Track monitoring state
    this.monitoringSubscription = null; // Store subscription reference
    this.dataProcessingTimeout = null; // Timeout for partial data recovery
    
    // UUIDs for ESP32 Water Sensor (must match Arduino code)
    this.SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
    this.CHARACTERISTIC_UUID = "87654321-4321-4321-4321-cba987654321";
    
    // Only create BLE manager if available
    if (BleManager) {
      try {
        this.manager = new BleManager();
        console.log('✅ BLE manager created successfully');
      } catch (error) {
        console.log('🧪 BLE manager not available, using mock mode:', error.message);
        this.manager = null;
      }
    } else {
      console.log('🧪 react-native-ble-plx not available, using mock mode');
    }
  }

  // Request permissions for Android
  async requestPermissions() {
    if (!this.manager) {
      console.log('🧪 Mock mode: Would request BLE permissions');
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        const allPermissionsGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allPermissionsGranted) {
          Alert.alert('Permissions Required', 'Bluetooth permissions are required to connect to your sensor.');
          return false;
        }
        return true;
      } catch (error) {
        console.error('Permission request error:', error);
        return false;
      }
    }
    return true;
  }

  // Scan for ESP32 devices
  async scanForDevices(onDeviceFound) {
    if (!this.manager) {
      console.log('🧪 BLE manager not available, using mock scan mode');
      // In Expo Go or when BLE is not available, use mock mode
      setTimeout(() => {
        console.log('🧪 Mock mode: Would show available ESP32 devices here');
        Alert.alert('Demo Mode', 'Bluetooth scanning is not available in Expo Go. In a development build, this would scan for real ESP32 devices.');
      }, 1000);
      return;
    }

    const hasPermissions = await this.requestPermissions();
    if (!hasPermissions) return;

    try {
      // Check if Bluetooth is enabled
      const bluetoothState = await this.manager.state();
      if (bluetoothState !== 'PoweredOn') {
        Alert.alert('Bluetooth Disabled', 'Please enable Bluetooth to scan for devices.');
        return;
      }

      console.log('Starting device scan...');
      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          Alert.alert('Scan Error', error.message);
          return;
        }

        if (device && device.name) {
          console.log('Found device:', device.name, device.id);
          // Look for ESP32 Water Sensor specifically, plus other ESP32 devices
          if (device.name.toLowerCase().includes('esp32-water-sensor') || 
              device.name.toLowerCase().includes('esp32') || 
              device.name.toLowerCase().includes('xiao') ||
              device.name.toLowerCase().includes('seeed') ||
              device.name === 'ESP32-Water-Sensor') {
            console.log('✅ Compatible water sensor device found:', device.name);
            onDeviceFound(device);
          }
        }
      });

      // Stop scanning after 10 seconds
      setTimeout(() => {
        this.stopScan();
      }, 10000);

    } catch (error) {
      console.error('Error starting scan:', error);
      Alert.alert('Error', 'Failed to start scanning for devices.');
    }
  }

  stopScan() {
    if (!this.manager) {
      console.log('🧪 Mock mode: Would stop BLE scan');
      return;
    }
    this.manager.stopDeviceScan();
    console.log('Stopped scanning');
  }

  // Connect to a specific device
  async connectToDevice(device) {
    if (!this.manager) {
      console.log('🧪 Mock mode: Would connect to device');
      throw new Error('Bluetooth not available in Expo Go. Use a development build for real BLE functionality.');
    }

    try {
      console.log('Connecting to device:', device.name);
      
      // Store original device info before connection
      const originalDeviceName = device.name || device.localName || 'Unknown Device';
      const originalDeviceId = device.id;
      
      this.device = await device.connect();
      console.log('Connected successfully');
      
      // Preserve original device name and ID after connection
      this.device.name = this.device.name || originalDeviceName;
      this.device.id = this.device.id || originalDeviceId;
      
      // Discover services and characteristics
      await this.device.discoverAllServicesAndCharacteristics();
      console.log('Services discovered');
      
      this.isConnected = true;
      
      // Debounce connection events to prevent multiple alerts
      const now = Date.now();
      if (now - this.lastConnectionEvent > 2000) {
        this.notifySubscribers('connected', { device: this.device });
        this.lastConnectionEvent = now;
      }
      
      // Monitor connection status with debouncing for disconnection events
      this.device.onDisconnected((error, device) => {
        console.log('Device disconnected:', error);
        
        // Debounce disconnection events to prevent duplicates
        const now = Date.now();
        if (this.isConnected && (now - this.lastConnectionEvent > 1000)) {
          this.isConnected = false;
          this.device = null;
          this.notifySubscribers('disconnected', { error });
          this.lastConnectionEvent = now;
          console.log('🔄 Disconnection event processed');
        } else {
          console.log('🔇 Duplicate disconnection event ignored');
        }
      });

      return this.device;
    } catch (error) {
      console.error('Connection error:', error);
      
      // Only show alert and notify if this isn't a duplicate event
      const now = Date.now();
      if (now - this.lastConnectionEvent > 1000) {
        this.lastConnectionEvent = now;
        
        // Reset connection state
        this.isConnected = false;
        this.device = null;
        
        // Notify subscribers about connection failure (not disconnection)
        this.notifySubscribers('connectionFailed', { error: error.message });
        Alert.alert('Connection Error', `Failed to connect: ${error.message}`);
      } else {
        console.log('🔇 Duplicate connection error ignored');
      }
      
      throw error;
    }
  }

  // Read sensor data from ESP32
  async readSensorData(serviceUUID, characteristicUUID) {
    if (!this.device || !this.isConnected) {
      throw new Error('No device connected');
    }

    try {
      const characteristic = await this.device.readCharacteristicForService(
        serviceUUID, 
        characteristicUUID
      );
      
      // Decode base64 data
      const rawData = characteristic.value;
      const decodedData = this.base64ToText(rawData);
      
      console.log('Sensor data received:', decodedData);
      this.notifySubscribers('dataReceived', { data: decodedData });
      
      return decodedData;
    } catch (error) {
      console.error('Error reading sensor data:', error);
      throw error;
    }
  }

  // Subscribe to notifications from ESP32
  async subscribeToNotifications(serviceUUID, characteristicUUID, callback) {
    if (!this.device || !this.isConnected) {
      throw new Error('No device connected');
    }

    try {
      this.isMonitoring = true;
      this.jsonBuffer = ''; // Reset buffer when starting new monitoring
      
      // Add timeout mechanism for partial data recovery
      if (this.dataProcessingTimeout) {
        clearTimeout(this.dataProcessingTimeout);
      }
      
      this.monitoringSubscription = this.device.monitorCharacteristicForService(
        serviceUUID,
        characteristicUUID,
        (error, characteristic) => {
          if (error) {
            console.error('Monitor error:', error);
            return;
          }

          // Check if monitoring is still active
          if (!this.isMonitoring) {
            console.log('🛑 Monitoring stopped, ignoring notification');
            return;
          }

          if (characteristic && characteristic.value) {
            try {
              const rawData = characteristic.value;
              const decodedData = this.base64ToText(rawData);
              console.log('Notification received:', decodedData);
              
              // Double-check monitoring state before processing
              if (!this.isMonitoring) {
                console.log('🛑 Monitoring stopped during processing, ignoring');
                return;
              }
              
              // Handle fragmented JSON data
              const completeSensorData = this.handleFragmentedJson(decodedData);
              
              if (completeSensorData) {
                console.log('Complete JSON received:', completeSensorData);
                try {
                  // Parse the complete sensor data
                  const parsedData = this.parseSensorData(completeSensorData);
                  callback(parsedData);
                  this.notifySubscribers('dataReceived', { data: parsedData });
                } catch (parseError) {
                  console.error('Error parsing complete JSON:', parseError);
                  callback({ error: 'Parse error', rawData: completeSensorData });
                }
              } else {
                console.log('Buffering fragment, waiting for complete JSON...');
                
                // Set a timeout to process partial data if no more data comes
                if (this.dataProcessingTimeout) {
                  clearTimeout(this.dataProcessingTimeout);
                }
                
                this.dataProcessingTimeout = setTimeout(() => {
                  if (this.isMonitoring && this.jsonBuffer.length > 0) {
                    console.log('⏰ Timeout reached, attempting partial data recovery');
                    const partialData = this.attemptPartialDataRecovery();
                    if (partialData) {
                      try {
                        const parsedData = this.parseSensorData(partialData);
                        callback(parsedData);
                        this.notifySubscribers('dataReceived', { data: parsedData });
                      } catch (parseError) {
                        console.error('Error parsing recovered data:', parseError);
                      }
                    }
                  }
                }, 1000); // 1 second timeout
              }
              
            } catch (error) {
              console.error('Error processing notification:', error);
              callback({ error: 'Processing error', rawData: error.message });
            }
          }
        }
      );
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      throw error;
    }
  }

  // Handle fragmented JSON data from ESP32
  handleFragmentedJson(newData) {
    // Don't process if monitoring is stopped
    if (!this.isMonitoring) {
      console.log('🛑 Monitoring stopped, not processing fragment');
      return null;
    }

    // Add new data to buffer
    this.jsonBuffer += newData;
    console.log('📝 Buffer now contains:', this.jsonBuffer.substring(0, 100) + (this.jsonBuffer.length > 100 ? '...' : ''));
    
    // Try to find complete JSON first
    let completeJson = this.findCompleteJson();
    
    // If no complete JSON found, try to parse partial data after a timeout or if buffer is getting full
    if (!completeJson && (this.jsonBuffer.length > 100 || this.shouldProcessPartial())) {
      completeJson = this.attemptPartialDataRecovery();
    }
    
    return completeJson;
  }

  findCompleteJson() {
    let completeJson = null;
    let openBraces = 0;
    let startIndex = -1;
    
    for (let i = 0; i < this.jsonBuffer.length; i++) {
      const char = this.jsonBuffer[i];
      
      if (char === '{') {
        if (openBraces === 0) {
          startIndex = i; // Start of potential JSON object
        }
        openBraces++;
      } else if (char === '}') {
        openBraces--;
        
        if (openBraces === 0 && startIndex !== -1) {
          // Found complete JSON object
          completeJson = this.jsonBuffer.substring(startIndex, i + 1);
          console.log('🎯 Found complete JSON:', completeJson);
          
          // Remove the processed JSON from buffer
          this.jsonBuffer = this.jsonBuffer.substring(i + 1);
          return completeJson;
        }
      }
    }
    
    return null;
  }

  shouldProcessPartial() {
    // Process partial data if we haven't received new data for a while
    // or if the buffer contains obvious partial JSON patterns
    return this.jsonBuffer.includes('"tds":') || this.jsonBuffer.includes('"vibration":');
  }

  attemptPartialDataRecovery() {
    console.log('🔧 Attempting partial data recovery from:', this.jsonBuffer);
    
    // Try to extract values from partial JSON using regex
    const tdsMatch = this.jsonBuffer.match(/"tds":\s*([0-9.]+)/);
    const qualityMatch = this.jsonBuffer.match(/"quality":\s*"([^"]+)"/);
    const vibrationMatch = this.jsonBuffer.match(/"vibration":\s*([0-9.]+)/);
    const timestampMatch = this.jsonBuffer.match(/"timestamp":\s*([0-9]+)/);
    
    if (tdsMatch || vibrationMatch) {
      // Construct a valid JSON from extracted values
      const reconstructedJson = {
        tds: tdsMatch ? parseFloat(tdsMatch[1]) : null,
        quality: qualityMatch ? qualityMatch[1] : null,
        vibration: vibrationMatch ? parseFloat(vibrationMatch[1]) : null,
        timestamp: timestampMatch ? parseInt(timestampMatch[1]) : Date.now(),
        deviceId: "ESP32-Water-Sensor",
        batteryLevel: 100,
        recovered: true // Flag to indicate this was reconstructed
      };
      
      console.log('🛠️ Reconstructed JSON from fragments:', reconstructedJson);
      
      // Clear the buffer since we've processed what we can
      this.jsonBuffer = '';
      
      return JSON.stringify(reconstructedJson);
    }
    
    // Clean up buffer if it gets too long (prevent memory issues)
    if (this.jsonBuffer.length > 1000) {
      console.warn('⚠️ JSON buffer too long, resetting');
      this.jsonBuffer = '';
    }
    
    return null;
  }

  // Stop notifications
  stopNotifications() {
    console.log('🛑 Stopping notifications...');
    this.isMonitoring = false;
    this.jsonBuffer = ''; // Clear buffer
    
    // Clear any pending timeout
    if (this.dataProcessingTimeout) {
      clearTimeout(this.dataProcessingTimeout);
      this.dataProcessingTimeout = null;
    }

    // Gracefully stop monitoring subscription with enhanced error handling
    if (this.monitoringSubscription) {
      return new Promise((resolve) => {
        try {
          // Set a timeout to prevent hanging
          const cleanupTimeout = setTimeout(() => {
            console.log('⏰ Cleanup timeout reached, forcing completion');
            this.monitoringSubscription = null;
            resolve();
          }, 2000);

          // Try to remove subscription gracefully
          const cleanup = () => {
            clearTimeout(cleanupTimeout);
            this.monitoringSubscription = null;
            console.log('✅ Monitoring subscription removed');
            resolve();
          };

          if (typeof this.monitoringSubscription.remove === 'function') {
            this.monitoringSubscription.remove();
            cleanup();
          } else if (typeof this.monitoringSubscription === 'function') {
            this.monitoringSubscription();
            cleanup();
          } else {
            console.warn('⚠️ Subscription remove method not available');
            cleanup();
          }
          
        } catch (error) {
          console.warn('⚠️ Error removing subscription (continuing anyway):', error.message);
          this.monitoringSubscription = null;
          resolve();
        }
      }).then(() => {
        // Additional cleanup after subscription is safely removed
        if (this.device && this.manager) {
          try {
            this.manager.stopDeviceScan();
            console.log('✅ Device scan stopped');
          } catch (error) {
            console.log('ℹ️ Device scan stop not needed or failed:', error.message);
          }
        }
        
        console.log('🏁 Stop notifications completed');
        return Promise.resolve();
      }).catch((error) => {
        console.error('❌ Error in stopNotifications:', error);
        this.monitoringSubscription = null;
        return Promise.resolve(); // Always resolve to prevent hanging
      });
    } else {
      console.log('ℹ️ No active monitoring subscription to stop');
      return Promise.resolve();
    }
  }

  // Disconnect from device
  async disconnect() {
    if (this.device) {
      try {
        await this.device.cancelConnection();
        console.log('Disconnected from device');
        this.isConnected = false;
        this.device = null;
        this.notifySubscribers('disconnected', {});
      } catch (error) {
        console.error('Disconnect error:', error);
      }
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
    if (!this.isConnected || !this.device) {
      throw new Error('Not connected to device');
    }

    try {
      console.log('Requesting single sensor reading from ESP32-C6...');
      
      // Read the characteristic once to get fresh data
      const characteristic = await this.device.readCharacteristicForService(
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID
      );

      if (!characteristic || !characteristic.value) {
        throw new Error('No data received from sensor');
      }

      // Decode the base64 data
      const rawData = this.base64ToText(characteristic.value);
      console.log('Raw sensor data received:', rawData);
      
      // Parse JSON data from ESP32-C6
      const sensorData = this.parseSensorData(rawData);
      
      console.log('Parsed sensor reading:', sensorData);
      return sensorData;
      
    } catch (error) {
      console.error('Failed to get single reading:', error);
      throw new Error(`Failed to read sensor: ${error.message}`);
    }
  }

  // Parse and validate sensor data from ESP32-C6
  parseSensorData(completeJsonString) {
    try {
      console.log('Parsing complete JSON:', completeJsonString);
      
      const parsed = JSON.parse(completeJsonString);
      
      // Expected format from ESP32_Water_Sensor_BLE.ino:
      // {
      //   "tds": 245.6,
      //   "quality": "Clean",
      //   "vibration": 0.12,
      //   "timestamp": 45231,
      //   "deviceId": "ESP32-Water-Sensor",
      //   "batteryLevel": 100
      // }
      
      const sensorData = {
        tds: parsed.tds !== null ? parseFloat(parsed.tds) || 0 : 0,
        quality: parsed.quality || this.calculateQuality(parseFloat(parsed.tds) || 0),
        vibration: parsed.vibration !== null ? parseFloat(parsed.vibration) || 0 : 0,
        timestamp: new Date().toISOString(), // Use current time for React Native
        deviceTimestamp: parseInt(parsed.timestamp) || Date.now(), // ESP32 millis()
        deviceId: parsed.deviceId || 'ESP32-Water-Sensor',
        batteryLevel: parseInt(parsed.batteryLevel) || 100,
        signalStrength: this.device?.rssi || 0, // Add signal strength if available
        connectionTime: this.lastConnectionEvent ? new Date(this.lastConnectionEvent).toISOString() : null,
        recovered: parsed.recovered || false // Flag if data was reconstructed from fragments
      };

      // Validate TDS reading
      if (sensorData.tds < 0 || sensorData.tds > 3000) {
        console.warn('TDS reading outside expected range:', sensorData.tds);
      }

      // If quality is missing and we have TDS, calculate it
      if (!sensorData.quality || sensorData.quality === 'null') {
        sensorData.quality = this.calculateQuality(sensorData.tds);
      }

      // Validate quality status
      const validQualities = ['Clean', 'Unsafe', 'Extremely Unsafe', 'Unknown'];
      if (!validQualities.includes(sensorData.quality)) {
        console.warn('Unexpected quality status:', sensorData.quality);
        sensorData.quality = this.calculateQuality(sensorData.tds);
      }

      if (sensorData.recovered) {
        console.log('🛠️ Successfully parsed recovered sensor data:', sensorData);
      } else {
        console.log('✅ Successfully parsed sensor data:', sensorData);
      }
      
      return sensorData;
      
    } catch (error) {
      console.error('❌ Failed to parse complete JSON:', error);
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
  }

  // Helper method to calculate water quality based on TDS
  calculateQuality(tds) {
    if (!tds || isNaN(tds)) return 'Unknown';
    
    const tdsValue = parseFloat(tds);
    if (tdsValue <= 300) return 'Clean';
    if (tdsValue <= 400) return 'Unsafe';
    return 'Extremely Unsafe';
  }

  // Helper method to decode base64 data
  base64ToText(base64String) {
    try {
      // React Native compatible base64 decoding
      if (typeof atob !== 'undefined') {
        // Use atob if available (React Native)
        return atob(base64String);
      } else if (typeof Buffer !== 'undefined') {
        // Fallback to Buffer if available (Node.js environments)
        return Buffer.from(base64String, 'base64').toString('utf-8');
      } else {
        // Manual base64 decode as last resort
        return this.manualBase64Decode(base64String);
      }
    } catch (error) {
      console.error('Failed to decode base64:', error);
      return base64String; // Return original if decode fails
    }
  }

  // Manual base64 decoding for React Native
  manualBase64Decode(base64String) {
    try {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      
      base64String = base64String.replace(/[^A-Za-z0-9+/]/g, '');
      
      while (i < base64String.length) {
        const encoded1 = chars.indexOf(base64String.charAt(i++));
        const encoded2 = chars.indexOf(base64String.charAt(i++));
        const encoded3 = chars.indexOf(base64String.charAt(i++));
        const encoded4 = chars.indexOf(base64String.charAt(i++));
        
        const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
        
        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
        if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
      }
      
      return result;
    } catch (error) {
      console.error('Manual base64 decode failed:', error);
      return base64String;
    }
  }

  // Cleanup
  destroy() {
    this.disconnect();
    this.subscribers = [];
    if (this.manager) {
      this.manager.destroy();
    }
  }
}

// Create singleton instance with error protection
let bluetoothService;
try {
  bluetoothService = new BluetoothService();
} catch (error) {
  console.log('🧪 BluetoothService using mock mode:', error.message);
  // Export a mock service that provides helpful feedback
  bluetoothService = {
    scanForDevices: () => { 
      console.log('🧪 Mock scan: Bluetooth not available in Expo Go');
      Alert.alert('Demo Mode', 'Bluetooth scanning requires a development build. Using mock data.');
    },
    connectToDevice: () => { 
      throw new Error('Bluetooth not available in Expo Go. Use a development build for real BLE functionality.'); 
    },
    disconnect: () => { console.log('🧪 Mock disconnect'); },
    subscribe: () => () => {},
    getConnectionStatus: () => ({ isConnected: false, device: null, deviceName: null }),
    requestSingleReading: () => { 
      throw new Error('Bluetooth not available in Expo Go. Use a development build for real sensor readings.'); 
    },
    destroy: () => { console.log('🧪 Mock destroy'); }
  };
}

export default bluetoothService;