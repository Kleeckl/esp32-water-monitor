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

  // Reset BLE scanning state
  async resetBluetooth() {
    console.log('🔄 Resetting Bluetooth state...');
    try {
      if (this.manager) {
        // Stop any active scans
        this.manager.stopDeviceScan();
        
        // Disconnect if connected
        if (this.device && this.device.isConnected) {
          await this.device.cancelConnection();
        }
        
        // Reset internal state
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;
        this.isMonitoring = false;
        this.monitoringSubscription = null;
        this.jsonBuffer = '';
        
        console.log('✅ Bluetooth state reset successfully');
        return true;
      }
    } catch (error) {
      console.error('❌ Error resetting Bluetooth:', error);
    }
    return false;
  }

  // Aggressive ESP32 recovery - try to find and reconnect
  async forceESP32Recovery() {
    console.log('🚨 Starting aggressive ESP32 recovery...');
    try {
      // First reset everything
      await this.resetBluetooth();
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check Bluetooth state
      const bluetoothState = await this.manager.state();
      console.log('📡 Bluetooth state:', bluetoothState);
      
      if (bluetoothState !== 'PoweredOn') {
        Alert.alert('Bluetooth Issue', 'Please turn Bluetooth off and on again, then try scanning.');
        return false;
      }
      
      // Force scan with longer duration
      console.log('🔍 Starting extended ESP32 scan...');
      return new Promise((resolve) => {
        let found = false;
        let scanTimeout;
        let esp32Device = null;
        
        const scanCallback = (error, device) => {
          if (error) {
            console.error('Recovery scan error:', error);
            return;
          }
          
          if (device) {
            console.log('🔍 Recovery scan found:', device.name || 'Unknown', device.id);
            
            // More aggressive ESP32 detection - look for our specific device ID too
            const isESP32 = device.name && (
              device.name.includes('ESP32') || 
              device.name.includes('esp32') ||
              device.name.includes('Water') ||
              device.name.includes('XIAO') ||
              device.name.includes('Seeed')
            ) || device.id === 'B4:3A:45:8A:0E:62'; // Your specific ESP32 MAC
            
            // Also check for devices with our service UUID
            const hasWaterService = device.serviceUUIDs && 
              device.serviceUUIDs.includes('12345678-1234-1234-1234-123456789abc');
            
            if ((isESP32 || hasWaterService) && !found) {
              found = true;
              esp32Device = device;
              console.log('🎯 ESP32 device recovered:', device.name || device.id);
              this.manager.stopDeviceScan();
              clearTimeout(scanTimeout);
              
              // Immediately try to connect to test if it's responsive
              Alert.alert(
                'ESP32 Found!', 
                `Found: ${device.name || device.id}.\n\nAttempting connection test...`,
                [
                  {
                    text: 'Test Connection',
                    onPress: async () => {
                      try {
                        await this.connectToDevice(esp32Device);
                        Alert.alert('Success!', 'ESP32 connection test successful! You can now use the device normally.');
                      } catch (error) {
                        Alert.alert(
                          'Connection Test Failed', 
                          `Device found but connection failed: ${error.message}\n\nTroubleshooting:\n1. Power cycle your ESP32\n2. Move closer to ESP32\n3. Check if ESP32 code is running properly`
                        );
                      }
                    }
                  },
                  {
                    text: 'Just Scan',
                    onPress: () => {
                      Alert.alert('Device Available', 'ESP32 found and available for connection in device list.');
                    }
                  }
                ]
              );
              resolve(true);
            }
          }
        };
        
        this.manager.startDeviceScan(null, null, scanCallback);
        
        // Extended timeout for recovery
        scanTimeout = setTimeout(() => {
          this.manager.stopDeviceScan();
          if (!found) {
            console.log('❌ ESP32 recovery scan timeout');
            Alert.alert(
              'ESP32 Not Found', 
              'Troubleshooting steps:\n\n1. Check ESP32 is powered on (LEDs should be visible)\n2. Verify ESP32 code is uploaded and running\n3. Power cycle ESP32 (unplug/replug power)\n4. Move closer to ESP32 (within 3 meters)\n5. Check if other devices can see the ESP32\n6. Try restarting your phone\'s Bluetooth'
            );
            resolve(false);
          }
        }, 20000); // 20 second scan for recovery
      });
      
    } catch (error) {
      console.error('❌ ESP32 recovery failed:', error);
      Alert.alert('Recovery Failed', 'Please restart the app and try again.');
      return false;
    }
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
      // Stop any existing scan first to reset state
      try {
        this.manager.stopDeviceScan();
        console.log('🔄 Stopped existing scan for fresh start');
      } catch (stopError) {
        console.log('ℹ️ No existing scan to stop:', stopError.message);
      }

      // Small delay to let BLE stack reset
      await new Promise(resolve => setTimeout(resolve, 500));

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
          // Try to recover from scan errors
          if (error.message.includes('already scanning') || error.message.includes('scan in progress')) {
            console.log('🔄 Scan already in progress, attempting to reset...');
            try {
              this.manager.stopDeviceScan();
              setTimeout(() => {
                console.log('🔄 Retrying scan after reset...');
                this.scanForDevices(onDeviceFound);
              }, 1000);
            } catch (resetError) {
              console.error('❌ Failed to reset scan:', resetError);
              Alert.alert('Scan Error', 'Please restart the app to reset Bluetooth scanning.');
            }
          } else {
            Alert.alert('Scan Error', error.message);
          }
          return;
        }

        if (device) {
          // Log all devices for debugging
          console.log('Found device:', device.name || 'Unknown', device.id);
          
          if (device.name) {
            // Look for ESP32 Water Sensor specifically, plus other ESP32 devices
            if (device.name.toLowerCase().includes('esp32-water-sensor') || 
                device.name.toLowerCase().includes('esp32') || 
                device.name.toLowerCase().includes('xiao') ||
                device.name.toLowerCase().includes('seeed') ||
                device.name === 'ESP32-Water-Sensor' ||
                device.name.includes('ESP32-Wa') ||
                device.name.includes('ESP32') ||
                device.name.toLowerCase().includes('water')) { // Added more patterns
              console.log('✅ Compatible water sensor device found:', device.name);
              onDeviceFound(device);
            }
          } else {
            // Check for devices without names that might be ESP32
            // ESP32 devices sometimes show up without names initially
            if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
              console.log('📡 Found unnamed device with services:', device.id, device.serviceUUIDs);
              
              // Check if this device has our water sensor service UUID
              const waterSensorServiceUUID = '12345678-1234-1234-1234-123456789abc';
              if (device.serviceUUIDs.includes(waterSensorServiceUUID)) {
                console.log('🎯 ESP32 Water Sensor found (unnamed):', device.id);
                // Create a device object with a friendly name for the UI
                const namedDevice = {
                  ...device,
                  name: 'ESP32 Water Sensor' // Give it a display name
                };
                onDeviceFound(namedDevice);
              }
            }
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
      console.log('🔗 Attempting to connect to device:', device.name, device.id);
      
      // Store original device info before connection
      const originalDeviceName = device.name || device.localName || 'Unknown Device';
      const originalDeviceId = device.id;
      
      // First, check if device is already connected
      const isConnected = await device.isConnected();
      if (isConnected) {
        console.log('📱 Device already connected, disconnecting first...');
        await device.cancelConnection();
        // Wait a moment before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Enhanced connection with multiple attempts and longer timeout
      let connectionError = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`🔗 Connection attempt ${attempts}/${maxAttempts}...`);
        
        try {
          // Increase timeout to 15 seconds for ESP32 compatibility
          const connectionPromise = device.connect();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Connection timeout after 15 seconds (attempt ${attempts})`)), 15000);
          });
          
          this.device = await Promise.race([connectionPromise, timeoutPromise]);
          console.log('✅ Connected successfully to:', originalDeviceName);
          
          // Preserve original device name and ID after connection
          this.device.name = this.device.name || originalDeviceName;
          this.device.id = this.device.id || originalDeviceId;
          
          // Discover services and characteristics
          console.log('🔍 Discovering services...');
          await this.device.discoverAllServicesAndCharacteristics();
          console.log('✅ Services discovered');
          
          this.isConnected = true;
          
          // Success - break out of retry loop
          connectionError = null;
          break;
          
        } catch (attemptError) {
          connectionError = attemptError;
          console.log(`❌ Connection attempt ${attempts} failed:`, attemptError.message);
          
          if (attempts < maxAttempts) {
            console.log(`⏳ Waiting 2 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // If all attempts failed, throw the last error
      if (connectionError) {
        throw connectionError;
      }
      
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
      console.error('❌ Connection failed:', error.message);
      console.error('📋 Error details:', {
        errorCode: error.errorCode,
        reason: error.reason,
        deviceName: device.name,
        deviceId: device.id
      });
      
      // Only show alert and notify if this isn't a duplicate event
      const now = Date.now();
      if (now - this.lastConnectionEvent > 1000) {
        this.lastConnectionEvent = now;
        
        // Reset connection state
        this.isConnected = false;
        this.device = null;
        
        // Provide specific error messages based on error type
        let userMessage = 'Failed to connect to ESP32';
        if (error.message.includes('timeout')) {
          userMessage = 'Connection timeout - check if ESP32 is powered on and nearby';
        } else if (error.message.includes('not found') || error.message.includes('unavailable')) {
          userMessage = 'ESP32 not responding - try power cycling the device';
        } else if (error.message.includes('permission')) {
          userMessage = 'Bluetooth permission required - check app settings';
        } else if (error.message.includes('already connected')) {
          userMessage = 'Device already connected - try using Reset Bluetooth button';
        }
        
        // Notify subscribers about connection failure (not disconnection)
        this.notifySubscribers('connectionFailed', { 
          error: error.message,
          userMessage,
          deviceName: device.name 
        });
        Alert.alert('Connection Failed', userMessage);
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
      console.log('🔍 Reading from service:', serviceUUID);
      console.log('🔍 Reading from characteristic:', characteristicUUID);
      
      // First check if device is still connected
      const isConnected = await this.device.isConnected();
      if (!isConnected) {
        throw new Error('Device disconnected during read operation');
      }
      
      // Try to read with enhanced error handling
      let characteristic;
      try {
        characteristic = await this.device.readCharacteristicForService(
          serviceUUID, 
          characteristicUUID
        );
      } catch (readError) {
        console.error('❌ Characteristic read failed:', readError);
        
        // Try to discover services again if read fails
        if (readError.message.includes('Unknown') || readError.message.includes('not found')) {
          console.log('🔄 Re-discovering services...');
          await this.device.discoverAllServicesAndCharacteristics();
          
          // Wait a moment and try again
          await new Promise(resolve => setTimeout(resolve, 500));
          characteristic = await this.device.readCharacteristicForService(
            serviceUUID, 
            characteristicUUID
          );
        } else {
          throw readError;
        }
      }
      
      if (!characteristic || !characteristic.value) {
        throw new Error('No data received from characteristic');
      }
      
      // Decode base64 data
      const rawData = characteristic.value;
      console.log('📥 Raw data received (base64):', rawData);
      
      const decodedData = this.base64ToText(rawData);
      console.log('📝 Decoded sensor data:', decodedData);
      
      this.notifySubscribers('dataReceived', { data: decodedData });
      
      return decodedData;
    } catch (error) {
      console.error('❌ Error reading sensor data:', error);
      console.error('📋 Error details:', {
        errorCode: error.errorCode,
        reason: error.reason,
        message: error.message,
        deviceConnected: this.isConnected,
        deviceId: this.device?.id
      });
      
      // Provide more helpful error message
      if (error.message.includes('Unknown error')) {
        throw new Error(`Failed to read sensor: ${error.message}. Try disconnecting and reconnecting to the ESP32.`);
      } else {
        throw new Error(`Failed to read sensor: ${error.message}`);
      }
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

          // Wrap the entire cleanup in a try-catch to prevent native crashes
          const safeCleanup = () => {
            try {
              clearTimeout(cleanupTimeout);
              this.monitoringSubscription = null;
              console.log('✅ Monitoring subscription removed');
              resolve();
            } catch (cleanupError) {
              console.warn('⚠️ Error during final cleanup (ignoring):', cleanupError.message);
              this.monitoringSubscription = null;
              resolve();
            }
          };

          // Add extra protection around subscription removal
          try {
            if (this.monitoringSubscription && typeof this.monitoringSubscription.remove === 'function') {
              // Wrap the remove call in setTimeout to isolate from main thread
              setTimeout(() => {
                try {
                  this.monitoringSubscription.remove();
                  safeCleanup();
                } catch (removeError) {
                  console.warn('⚠️ Subscription.remove() failed (continuing):', removeError.message);
                  safeCleanup();
                }
              }, 50);
            } else if (this.monitoringSubscription && typeof this.monitoringSubscription === 'function') {
              setTimeout(() => {
                try {
                  this.monitoringSubscription();
                  safeCleanup();
                } catch (funcError) {
                  console.warn('⚠️ Subscription function call failed (continuing):', funcError.message);
                  safeCleanup();
                }
              }, 50);
            } else {
              console.warn('⚠️ Subscription remove method not available');
              safeCleanup();
            }
          } catch (subscriptionError) {
            console.warn('⚠️ Subscription handling failed (continuing):', subscriptionError.message);
            safeCleanup();
          }
          
        } catch (error) {
          console.warn('⚠️ Error removing subscription (continuing anyway):', error.message);
          this.monitoringSubscription = null;
          resolve();
        }
      }).then(() => {
        // Additional cleanup after subscription is safely removed
        return new Promise((resolve) => {
          try {
            if (this.device && this.manager) {
              // Wrap device scan stop in timeout and try-catch
              setTimeout(() => {
                try {
                  this.manager.stopDeviceScan();
                  console.log('✅ Device scan stopped');
                } catch (scanError) {
                  console.log('ℹ️ Device scan stop not needed or failed:', scanError.message);
                }
                resolve();
              }, 100);
            } else {
              resolve();
            }
          } catch (deviceError) {
            console.log('ℹ️ Device cleanup error (ignoring):', deviceError.message);
            resolve();
          }
        });
      }).then(() => {
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