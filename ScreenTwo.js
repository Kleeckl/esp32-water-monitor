import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Import the appropriate service based on environment
let bluetoothService;
try {
  // Try to import the real Bluetooth service
  bluetoothService = require('./BluetoothService').default;
} catch (error) {
  // Fall back to simulated service for Expo Go
  console.log('Using simulated Bluetooth service for Expo Go');
  bluetoothService = require('./SimulatedBluetoothService').default;
}

export default function ScreenTwo({ navigation, route }) {
  const [sensorData, setSensorData] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    deviceName: null
  });
  const [isReading, setIsReading] = useState(false);
  const [highlightedTest, setHighlightedTest] = useState(null);
  const wasReadingRef = useRef(false);

  // Track reading state for cleanup
  useEffect(() => {
    wasReadingRef.current = isReading;
  }, [isReading]);

  // Handle cleanup when screen loses focus (user navigates away)
  useFocusEffect(
    React.useCallback(() => {
      // This runs when screen comes into focus
      console.log('📱 ScreenTwo gained focus');
      
      return () => {
        // This runs when screen loses focus (user navigates away)
        console.log('📤 ScreenTwo lost focus, checking for cleanup...');
        
        if (wasReadingRef.current) {
          console.log('🛑 Auto-stopping data collection - user navigated away while collecting');
          try {
            if (bluetoothService && bluetoothService.stopNotifications) {
              bluetoothService.stopNotifications();
            }
            // Don't show alert here since user is navigating away
          } catch (error) {
            console.error('Error stopping notifications on navigation:', error);
          }
        }
      };
    }, [])
  );

  useEffect(() => {
    // Check if we have a highlighted test from navigation
    if (route?.params?.highlightedTest) {
      setHighlightedTest(route.params.highlightedTest);
    }

    // Get initial connection status
    const status = bluetoothService.getConnectionStatus();
    setConnectionStatus({
      isConnected: status.isConnected,
      deviceName: status.deviceName
    });

    // Subscribe to Bluetooth service events
    const unsubscribe = bluetoothService.subscribe((event, data) => {
      switch (event) {
        case 'connected':
          setConnectionStatus({
            isConnected: true,
            deviceName: data.device.name || 'ESP32 Sensor'
          });
          break;
        case 'disconnected':
          setConnectionStatus({
            isConnected: false,
            deviceName: null
          });
          setSensorData([]);
          setIsReading(false);
          break;
        case 'dataReceived':
          addSensorReading(data.data);
          break;
      }
    });

    // Simple cleanup - just unsubscribe from events
    return () => {
      console.log('📤 ScreenTwo component unmounting, unsubscribing from events');
      unsubscribe();
    };
  }, []); // Back to empty dependency array

  const addSensorReading = (data) => {
    const timestamp = new Date().toLocaleTimeString();
    const uniqueId = `${Date.now()}-${Math.random()}`;
    setSensorData(prevData => [
      { timestamp, data, id: uniqueId },
      ...prevData.slice(0, 19) // Keep only last 20 readings
    ]);
  };

  // Function to determine water quality based on TDS levels
  const getWaterQuality = (tdsValue) => {
    if (!tdsValue || isNaN(tdsValue)) return 'Unknown';
    
    const tds = parseFloat(tdsValue);
    if (tds <= 300) return 'Clean';
    if (tds <= 400) return 'Unsafe';
    return 'Extremely Unsafe';
  };

  // Function to format sensor data for display
  const formatSensorData = (rawData) => {
    try {
      let parsedData;
      
      // Handle different data formats
      if (typeof rawData === 'string') {
        // Try to parse as JSON first
        try {
          parsedData = JSON.parse(rawData);
        } catch (jsonError) {
          console.log('Data is not JSON, treating as raw string:', rawData);
          
          // Try to extract values from raw string if it contains key-value pairs
          // Look for patterns like "tds:123" or "tds=123"
          const tdsMatch = rawData.match(/tds[:\s=]+([0-9.]+)/i);
          const vibrationMatch = rawData.match(/vibration[:\s=]+([0-9.]+)/i);
          
          parsedData = {
            tds: tdsMatch ? parseFloat(tdsMatch[1]) : null,
            vibration: vibrationMatch ? parseFloat(vibrationMatch[1]) : null,
            rawString: rawData // Keep original string for debugging
          };
        }
      } else if (typeof rawData === 'object' && rawData !== null) {
        parsedData = rawData;
      } else {
        // Handle other data types
        console.warn('Unexpected data type:', typeof rawData, rawData);
        parsedData = { rawData: String(rawData) }; // Convert to string to prevent object rendering
      }

      const tds = parsedData.tds || 'N/A';
      const vibration = parsedData.vibration || 'N/A';
      const quality = (tds !== 'N/A' && !isNaN(tds)) ? getWaterQuality(tds) : 'Unknown';

      return {
        tds: (tds !== 'N/A' && !isNaN(tds)) ? `${Number(tds).toFixed(1)} ppm` : 'N/A',
        quality: String(quality), // Ensure it's a string
        vibration: (vibration !== 'N/A' && !isNaN(vibration)) ? `${Number(vibration).toFixed(2)} m/s²` : 'N/A'
      };
    } catch (error) {
      console.error('Error formatting sensor data:', error);
      console.log('Raw data causing error:', rawData);
      return {
        tds: 'Parse Error',
        quality: 'Parse Error',
        vibration: 'Parse Error'
      };
    }
  };

  const startDataCollection = async () => {
    if (!connectionStatus.isConnected) {
      Alert.alert('No Connection', 'Please connect to your ESP32 device first.');
      return;
    }

    try {
      setIsReading(true);
      
      // Replace these UUIDs with your ESP32's actual service and characteristic UUIDs
      // Common ESP32 UUIDs or you can define custom ones
      const serviceUUID = '12345678-1234-1234-1234-123456789abc'; // Replace with your service UUID
      const characteristicUUID = '87654321-4321-4321-4321-cba987654321'; // Replace with your characteristic UUID
      
      // Subscribe to notifications for continuous data
      await bluetoothService.subscribeToNotifications(
        serviceUUID,
        characteristicUUID,
        (data) => {
          console.log('Real-time data:', data);
          addSensorReading(data);
        }
      );

      // Don't show success alert here since connection success is already shown on home screen
      console.log('Started collecting sensor data');
    } catch (error) {
      console.error('Error starting data collection:', error);
      Alert.alert('Error', `Failed to start data collection: ${error.message}`);
      setIsReading(false);
    }
  };

  const stopDataCollection = () => {
    console.log('🛑 Stop data collection requested');
    setIsReading(false);
    
    try {
      // Stop notifications from the Bluetooth service with timeout protection
      if (bluetoothService && bluetoothService.stopNotifications) {
        // Use setTimeout to prevent blocking UI
        setTimeout(() => {
          try {
            bluetoothService.stopNotifications();
            console.log('✅ Successfully requested stop of data collection');
          } catch (innerError) {
            console.error('❌ Inner error stopping data collection:', innerError);
          }
        }, 100); // Small delay to allow UI to update first
      } else {
        console.warn('⚠️ stopNotifications method not available');
      }
    } catch (error) {
      console.error('❌ Error stopping data collection:', error);
      // Don't show alert for this error as it might be expected during BLE cleanup
    }
    
    // Show user feedback immediately (don't wait for BLE cleanup)
    setTimeout(() => {
      Alert.alert(
        'Collection Stopped', 
        'Data collection has been stopped.',
        [{ text: 'OK' }]
      );
    }, 200);
    
    console.log('🏁 Stopped collecting sensor data');
  };

  const readSingleValue = async () => {
    if (!connectionStatus.isConnected) {
      Alert.alert('No Connection', 'Please connect to your ESP32 device first.');
      return;
    }

    try {
      // Replace these UUIDs with your ESP32's actual service and characteristic UUIDs
      const serviceUUID = '12345678-1234-1234-1234-123456789abc'; // Replace with your service UUID
      const characteristicUUID = '87654321-4321-4321-4321-cba987654321'; // Replace with your characteristic UUID
      
      const data = await bluetoothService.readSensorData(serviceUUID, characteristicUUID);
      addSensorReading(data);
      // Success is implied by data appearing in the list, no need for alert
      console.log('Sensor data read successfully');
    } catch (error) {
      console.error('Error reading sensor data:', error);
      Alert.alert('Error', `Failed to read sensor data: ${error.message}`);
    }
  };

  const clearData = () => {
    setSensorData([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sensor Data Screen</Text>
      
      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {connectionStatus.isConnected 
            ? `Connected to: ${connectionStatus.deviceName}` 
            : 'Not Connected to ESP32'
          }
        </Text>
      </View>

      {/* Highlighted Test Results */}
      {highlightedTest && (
        <View style={styles.highlightedTestContainer}>
          <View style={styles.highlightedTestHeader}>
            <Text style={styles.highlightedTestTitle}>📋 Selected Test Result</Text>
            <Button
              title="✕"
              onPress={() => setHighlightedTest(null)}
              color="#dc3545"
            />
          </View>
          
          <View style={styles.testDetails}>
            <Text style={styles.testDate}>
              {new Date(highlightedTest.timestamp).toLocaleString()}
            </Text>
            <Text style={styles.testType}>
              Type: {highlightedTest.testType === 'manual' ? 'Manual Test' : 'Automatic Test'}
            </Text>
            
            {highlightedTest.sensorData && !highlightedTest.sensorData.error ? (
              <View style={styles.sensorReadings}>
                <Text style={styles.readingTitle}>Water Quality Readings:</Text>
                <View style={styles.readingGrid}>
                  <View style={styles.readingItem}>
                    <Text style={styles.readingLabel}>TDS</Text>
                    <Text style={styles.readingValue}>
                      {highlightedTest.sensorData.tds ? `${highlightedTest.sensorData.tds} ppm` : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.readingItem}>
                    <Text style={styles.readingLabel}>Quality</Text>
                    <Text style={[
                      styles.readingValue,
                      highlightedTest.sensorData.tds ? (
                        getWaterQuality(highlightedTest.sensorData.tds) === 'Clean' ? styles.qualityGood :
                        getWaterQuality(highlightedTest.sensorData.tds) === 'Unsafe' ? styles.qualityWarning :
                        styles.qualityDanger
                      ) : {}
                    ]}>
                      {highlightedTest.sensorData.tds ? getWaterQuality(highlightedTest.sensorData.tds) : 'Unknown'}
                    </Text>
                  </View>
                  <View style={styles.readingItem}>
                    <Text style={styles.readingLabel}>Vibration</Text>
                    <Text style={styles.readingValue}>
                      {highlightedTest.sensorData.vibration ? `${highlightedTest.sensorData.vibration} m/s²` : 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.errorText}>
                {highlightedTest.sensorData?.error || 'No sensor data available'}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Data Collection Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.buttonRow}>
          <Button
            title="Read Once"
            onPress={readSingleValue}
            disabled={!connectionStatus.isConnected || isReading}
          />
          {!isReading ? (
            <Button
              title="Start Collection"
              onPress={startDataCollection}
              disabled={!connectionStatus.isConnected}
              color="green"
            />
          ) : (
            <Button
              title="Stop Collection"
              onPress={stopDataCollection}
              color="red"
            />
          )}
        </View>
        
        <View style={styles.buttonContainer}>
          <Button
            title="Clear Data"
            onPress={clearData}
            color="orange"
          />
        </View>
      </View>

      {/* Sensor Data Display */}
      <View style={styles.dataContainer}>
        <Text style={styles.dataTitle}>
          Sensor Readings ({sensorData.length})
        </Text>
        
        <ScrollView style={styles.dataScroll}>
          {sensorData.length === 0 ? (
            <Text style={styles.noDataText}>
              {connectionStatus.isConnected 
                ? 'No sensor data yet. Click "Read Once" or "Start Collection".' 
                : 'Connect to your ESP32 to start collecting data.'
              }
            </Text>
          ) : (
            sensorData.map((reading) => {
              const formatted = formatSensorData(reading.data);
              return (
                <View key={reading.id} style={styles.dataItem}>
                  <Text style={styles.dataTimestamp}>{reading.timestamp}</Text>
                  <View style={styles.sensorValueGrid}>
                    <View style={styles.sensorValueItem}>
                      <Text style={styles.sensorLabel}>TDS:</Text>
                      <Text style={styles.sensorValue}>{formatted.tds}</Text>
                    </View>
                    <View style={styles.sensorValueItem}>
                      <Text style={styles.sensorLabel}>Quality:</Text>
                      <Text style={[
                        styles.sensorValue, 
                        formatted.quality === 'Clean' ? styles.qualityGood : 
                        formatted.quality === 'Unsafe' ? styles.qualityWarning : 
                        styles.qualityDanger
                      ]}>
                        {formatted.quality}
                      </Text>
                    </View>
                    <View style={styles.sensorValueItem}>
                      <Text style={styles.sensorLabel}>Vibration:</Text>
                      <Text style={styles.sensorValue}>{formatted.vibration}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
      
      <View style={styles.buttonContainer}>
        <Button
          title="Back to Home"
          onPress={() => navigation.goBack()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#e8f5e8',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#2e7d32',
  },
  statusContainer: {
    padding: 15,
    backgroundColor: '#c8e6c9',
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b5e20',
  },
  controlsContainer: {
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  buttonContainer: {
    marginVertical: 8,
  },
  dataContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
  },
  dataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#2e7d32',
  },
  dataScroll: {
    flex: 1,
  },
  noDataText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 50,
    fontStyle: 'italic',
  },
  dataItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#f1f8e9',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  dataTimestamp: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  sensorValueGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  sensorValueItem: {
    alignItems: 'center',
    minWidth: '30%',
  },
  sensorLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  sensorValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  qualityGood: {
    color: '#4caf50',
  },
  qualityWarning: {
    color: '#ff9800',
  },
  qualityDanger: {
    color: '#f44336',
  },
  dataValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  highlightedTestContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  highlightedTestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  highlightedTestTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#856404',
  },
  testDetails: {
    marginTop: 5,
  },
  testDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  testType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  sensorReadings: {
    marginTop: 10,
  },
  readingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  readingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  readingItem: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    width: '32%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  readingLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  readingValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#dc3545',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
});