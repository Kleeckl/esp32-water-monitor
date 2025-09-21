import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert, FlatList, TouchableOpacity, BackHandler } from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ScreenTwo from './ScreenTwo';
import WaterTestingChecklist from './WaterTestingChecklist';
import VibrationStatsScreen from './VibrationStatsScreen';
import NotificationService from './NotificationService';

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

const Stack = createNativeStackNavigator();

function HomeScreen({ navigation }) {
  const [isScanning, setIsScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    device: null,
    deviceName: null
  });
  const [hasShownConnectionAlert, setHasShownConnectionAlert] = useState(false);
  const [lastDataReceived, setLastDataReceived] = useState(null);

  useEffect(() => {
    // Get initial connection status when screen loads
    const status = bluetoothService.getConnectionStatus();
    setConnectionStatus({
      isConnected: status.isConnected,
      device: status.device,
      deviceName: status.deviceName
    });

    // Subscribe to Bluetooth service events
    const unsubscribe = bluetoothService.subscribe((event, data) => {
      switch (event) {
        case 'connected':
          setConnectionStatus({
            isConnected: true,
            device: data.device,
            deviceName: data.device.name
          });
          // Only show alert if we haven't shown it recently
          if (!hasShownConnectionAlert) {
            Alert.alert('Success', `Connected to ${data.device.name}`);
            setHasShownConnectionAlert(true);
            // Reset the flag after 3 seconds to allow future connections
            setTimeout(() => setHasShownConnectionAlert(false), 3000);
          }
          break;
        case 'disconnected':
          setConnectionStatus({
            isConnected: false,
            device: null,
            deviceName: null
          });
          setHasShownConnectionAlert(false);
          setLastDataReceived(null);
          // Only show disconnection alert if this was an unexpected disconnection
          // (connection failures are handled by connectionFailed event)
          if (data.error && !data.error.message?.includes('Failed to connect')) {
            Alert.alert('Disconnected', 'Device has been disconnected');
          }
          break;
        case 'connectionFailed':
          setConnectionStatus({
            isConnected: false,
            device: null,
            deviceName: null
          });
          setHasShownConnectionAlert(false);
          // Connection failure alert is already handled in BluetoothService
          console.log('Connection failed:', data.error);
          break;
        case 'dataReceived':
          console.log('Data received on home screen:', data.data);
          // Ensure data is safely formatted for display
          if (data.data && typeof data.data === 'object') {
            setLastDataReceived({
              data: data.data,
              timestamp: new Date().toLocaleTimeString()
            });
          } else {
            console.warn('Invalid data received:', data);
          }
          break;
      }
    });

    return unsubscribe;
  }, [hasShownConnectionAlert]);

  const startScan = () => {
    setIsScanning(true);
    setFoundDevices([]);
    
    bluetoothService.scanForDevices((device) => {
      setFoundDevices(prevDevices => {
        // Avoid duplicates
        const exists = prevDevices.find(d => d.id === device.id);
        if (!exists) {
          return [...prevDevices, device];
        }
        return prevDevices;
      });
    });

    // Stop scanning after 10 seconds
    setTimeout(() => {
      setIsScanning(false);
      bluetoothService.stopScan();
    }, 10000);
  };

  const connectToDevice = async (device) => {
    try {
      setIsScanning(false);
      bluetoothService.stopScan();
      await bluetoothService.connectToDevice(device);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const disconnect = async () => {
    await bluetoothService.disconnect();
  };

  const renderDevice = ({ item }) => (
    <TouchableOpacity 
      style={styles.deviceItem} 
      onPress={() => connectToDevice(item)}
    >
      <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
      <Text style={styles.deviceId}>{item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Well well well...</Text>
      <Text style={styles.subtitle}>ESP32 Sensor Connection</Text>
      
      {/* Environment indicator */}
      <View style={styles.environmentBanner}>
        <Text style={styles.environmentText}>
          {bluetoothService.constructor.name === 'SimulatedBluetoothService' 
            ? '🧪 DEMO MODE - Simulated Bluetooth' 
            : '📡 LIVE MODE - Real Bluetooth'
          }
        </Text>
      </View>
      
      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {connectionStatus.isConnected ? 
            `Connected to ${connectionStatus.deviceName || 'ESP32 Sensor'}` : 
            'Not Connected'
          }
        </Text>
        {connectionStatus.isConnected && (
          <Button
            title="Disconnect"
            color="red"
            onPress={disconnect}
          />
        )}
      </View>

      {/* Last Data Received */}
      {connectionStatus.isConnected && lastDataReceived && (
        <View style={styles.dataPreviewContainer}>
          <Text style={styles.dataPreviewTitle}>Latest Data:</Text>
          <Text style={styles.dataPreviewTime}>{lastDataReceived.timestamp}</Text>
          <Text style={styles.dataPreviewData} numberOfLines={2}>
            TDS: {lastDataReceived.data?.tds?.toFixed(1) || 'N/A'} ppm | 
            Quality: {lastDataReceived.data?.quality || 'N/A'} | 
            Vibration: {lastDataReceived.data?.vibration?.toFixed(2) || 'N/A'} m/s²
          </Text>
        </View>
      )}

      {/* Bluetooth Controls */}
      {!connectionStatus.isConnected && (
        <View style={styles.bluetoothSection}>
          <View style={styles.buttonContainer}>
            <Button
              title={isScanning ? "Scanning..." : "Scan for ESP32"}
              onPress={startScan}
              disabled={isScanning}
            />
          </View>

          {foundDevices.length > 0 && (
            <View style={styles.devicesSection}>
              <Text style={styles.devicesTitle}>Found Devices:</Text>
              <FlatList
                data={foundDevices}
                renderItem={renderDevice}
                keyExtractor={(item) => item.id}
                style={styles.devicesList}
              />
            </View>
          )}
        </View>
      )}
      
      {/* Navigation Buttons */}
      <View style={styles.navigationSection}>
        <Text style={styles.navigationTitle}>
          {connectionStatus.isConnected ? 
            'View detailed sensor data:' : 
            'Connect to ESP32 first, then view data:'
          }
        </Text>
        
        <View style={styles.buttonContainer}>
          <Button
            title="Go to Sensor Data Screen"
            color="green"
            onPress={() => navigation.navigate('ScreenTwo')}
          />
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title="Water Testing Checklist"
            color="blue"
            onPress={() => navigation.navigate('WaterTestingChecklist')}
          />
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title="Vibration Statistics"
            color="purple"
            onPress={() => navigation.navigate('VibrationStats')}
          />
        </View>
        
        {connectionStatus.isConnected && (
          <Text style={styles.backgroundNote}>
            💡 Connection and data collection continue in background
          </Text>
        )}
      </View>
    </View>
  );
}

export default function App() {
  const navigationRef = React.useRef();

  React.useEffect(() => {
    // Initialize notification service (wrapped in try-catch for safety)
    try {
      NotificationService.initialize().catch(error => {
        console.warn('Notification service failed to initialize:', error);
      });
      
      // Setup notification response handler
      const notificationSubscription = NotificationService.setupNotificationResponseHandler(navigationRef);
      
      // Check for overdue reminders on app start
      NotificationService.checkAndScheduleOverdueReminders().catch(error => {
        console.warn('Failed to check overdue reminders:', error);
      });
    } catch (error) {
      console.warn('Notification setup failed:', error);
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      const navigation = navigationRef.current;
      
      if (navigation) {
        const currentRoute = navigation.getCurrentRoute();
        
        // If we're on the Home screen, exit the app
        if (currentRoute.name === 'Home') {
          BackHandler.exitApp();
          return true;
        }
        
        // If we're on any other screen, go back to Home
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
      }
      
      return false;
    });

    return () => {
      backHandler.remove();
      try {
        notificationSubscription?.remove();
      } catch (error) {
        console.warn('Failed to remove notification subscription:', error);
      }
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ 
            title: 'ESP32 Bluetooth App',
            headerLeft: null, // Disable back button on home screen
          }}
        />
        <Stack.Screen 
          name="ScreenTwo" 
          component={ScreenTwo}
          options={{ 
            title: 'Sensor Data',
            headerBackTitleVisible: false,
          }}
        />
        <Stack.Screen 
          name="WaterTestingChecklist" 
          component={WaterTestingChecklist}
          options={{ 
            title: 'Water Testing',
            headerBackTitleVisible: false,
          }}
        />
        <Stack.Screen 
          name="VibrationStats" 
          component={VibrationStatsScreen}
          options={{ 
            title: 'Vibration Statistics',
            headerBackTitleVisible: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    color: '#666',
  },
  environmentBanner: {
    backgroundColor: '#fff3cd',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  environmentText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    textAlign: 'center',
  },
  statusContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1976d2',
  },
  dataPreviewContainer: {
    backgroundColor: '#e8f5e8',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  dataPreviewTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 5,
  },
  dataPreviewTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  dataPreviewData: {
    fontSize: 13,
    color: '#333',
    fontFamily: 'monospace',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
  },
  bluetoothSection: {
    width: '100%',
    marginBottom: 20,
  },
  devicesSection: {
    marginTop: 15,
    maxHeight: 200,
  },
  devicesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  devicesList: {
    maxHeight: 150,
  },
  deviceItem: {
    padding: 12,
    marginVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  navigationSection: {
    width: '100%',
    marginTop: 20,
  },
  navigationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  buttonContainer: {
    marginVertical: 8,
    width: '100%',
  },
  backgroundNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
});