import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Button, 
  TouchableOpacity, 
  Alert,
  RefreshControl 
} from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationService from './NotificationService';

// Import the appropriate service based on environment
let bluetoothService;
try {
  bluetoothService = require('./BluetoothService').default;
} catch (error) {
  bluetoothService = require('./SimulatedBluetoothService').default;
}

export default function WaterTestingChecklist({ navigation }) {
  const [testingHistory, setTestingHistory] = useState([]);
  const [weeklyStatus, setWeeklyStatus] = useState({});
  const [rainEvents, setRainEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduledNotifications, setScheduledNotifications] = useState([]);
  const [notificationServiceStatus, setNotificationServiceStatus] = useState({});
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    deviceName: null
  });

  useEffect(() => {
    loadTestingData();
    loadScheduledNotifications();
    loadNotificationServiceStatus();
    
    // Get connection status
    const status = bluetoothService.getConnectionStatus();
    setConnectionStatus({
      isConnected: status.isConnected,
      deviceName: status.deviceName
    });

    // Subscribe to data collection events
    const unsubscribe = bluetoothService.subscribe((event, data) => {
      if (event === 'dataReceived') {
        recordAutoWaterTest(data.data);
      }
    });

    return unsubscribe;
  }, []);

  const loadNotificationServiceStatus = () => {
    try {
      const status = NotificationService.getServiceStatus();
      setNotificationServiceStatus(status);
    } catch (error) {
      console.error('Error loading notification service status:', error);
    }
  };

  const loadScheduledNotifications = async () => {
    try {
      const notifications = await NotificationService.getScheduledNotifications();
      setScheduledNotifications(notifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const loadTestingData = async () => {
    try {
      const [history, weekly, rain] = await Promise.all([
        AsyncStorage.getItem('waterTestingHistory'),
        AsyncStorage.getItem('weeklyTestingStatus'),
        AsyncStorage.getItem('rainEvents')
      ]);

      setTestingHistory(history ? JSON.parse(history) : []);
      setWeeklyStatus(weekly ? JSON.parse(weekly) : {});
      setRainEvents(rain ? JSON.parse(rain) : []);
    } catch (error) {
      console.error('Error loading testing data:', error);
    }
  };

  const saveTestingData = async (history, weekly, rain) => {
    try {
      await Promise.all([
        AsyncStorage.setItem('waterTestingHistory', JSON.stringify(history)),
        AsyncStorage.setItem('weeklyTestingStatus', JSON.stringify(weekly)),
        AsyncStorage.setItem('rainEvents', JSON.stringify(rain))
      ]);
    } catch (error) {
      console.error('Error saving testing data:', error);
    }
  };

  const recordAutoWaterTest = (rawSensorData) => {
    try {
      // Parse the sensor data if it's a JSON string
      let sensorData;
      if (typeof rawSensorData === 'string') {
        try {
          sensorData = JSON.parse(rawSensorData);
        } catch (parseError) {
          console.error('Failed to parse sensor data:', parseError);
          sensorData = { raw: rawSensorData, error: 'Parse error' };
        }
      } else {
        sensorData = rawSensorData;
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const weekKey = getWeekKey(now);

      // Add timestamp if not present
      if (sensorData && !sensorData.timestamp) {
        sensorData.timestamp = now.toISOString();
      }

      const newTest = {
        id: Date.now(),
        date: dateStr,
        timestamp: now.toISOString(),
        week: weekKey,
        sensorData: sensorData,
        testType: 'automatic'
      };

      const updatedHistory = [newTest, ...testingHistory];
      const updatedWeekly = {
        ...weeklyStatus,
        [weekKey]: {
          tested: true,
          date: dateStr,
          timestamp: now.toISOString(),
          lastTestData: sensorData
        }
      };

      // Check if this test satisfies any pending rain events
      const updatedRainEvents = rainEvents.map(event => {
        if (!event.tested && new Date(event.date) <= now) {
          return { ...event, tested: true, testDate: dateStr, testData: sensorData };
        }
        return event;
      });

      setTestingHistory(updatedHistory);
      setWeeklyStatus(updatedWeekly);
      setRainEvents(updatedRainEvents);
      
      saveTestingData(updatedHistory, updatedWeekly, updatedRainEvents);

      console.log('Auto water test recorded with sensor data:', sensorData);
    } catch (error) {
      console.error('Failed to record auto water test:', error);
    }
  };

  const recordWaterTest = async () => {
    // Check if we're in Expo Go (demo mode) vs development build (real mode)
    const isExpoGo = Constants.executionEnvironment === 'storeClient';
    
    if (!isExpoGo && !connectionStatus.isConnected) {
      Alert.alert(
        'No Sensor Connected',
        'Please connect to your ESP32 sensor before recording a manual test. Use the "Connect to Sensor" button on the home screen.',
        [{ text: 'OK' }]
      );
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekKey = getWeekKey(now);

    // Try to get current sensor data if connected
    let sensorData = null;
    try {
      if (connectionStatus.isConnected) {
        // Request a fresh reading from the sensor
        sensorData = await bluetoothService.requestSingleReading();
        console.log('Collected sensor data for manual test:', sensorData);
      } else {
        // Only use simulated data in Expo Go for demo purposes
        if (isExpoGo) {
          sensorData = {
            tds: Math.floor(100 + Math.random() * 200),
            vibration: (Math.random() * 2).toFixed(2),
            timestamp: now.toISOString(),
            demo: true
          };
          console.log('Generated sample data for Expo Go demo:', sensorData);
        } else {
          throw new Error('No sensor connected in development build');
        }
      }
    } catch (error) {
      console.error('Failed to get sensor data:', error);
      
      if (!isExpoGo) {
        Alert.alert(
          'Sensor Error',
          'Failed to read data from ESP32 sensor. Please check your connection and try again.',
          [{ text: 'OK' }]
        );
        return;
      } else {
        // Fallback for Expo Go demo mode
        sensorData = {
          tds: 'N/A',
          vibration: 'N/A',
          error: 'Failed to read sensor',
          timestamp: now.toISOString(),
          demo: true
        };
      }
    }

    const newTest = {
      id: Date.now(),
      date: dateStr,
      timestamp: now.toISOString(),
      week: weekKey,
      sensorData: sensorData,
      testType: 'manual'
    };

    const updatedHistory = [newTest, ...testingHistory];
    const updatedWeekly = {
      ...weeklyStatus,
      [weekKey]: {
        tested: true,
        date: dateStr,
        timestamp: now.toISOString(),
        lastTestData: sensorData
      }
    };

    // Check if this test satisfies any pending rain events
    const updatedRainEvents = rainEvents.map(event => {
      if (!event.tested && new Date(event.date) <= now) {
        return { ...event, tested: true, testDate: dateStr, testData: sensorData };
      }
      return event;
    });

    setTestingHistory(updatedHistory);
    setWeeklyStatus(updatedWeekly);
    setRainEvents(updatedRainEvents);
    
    await saveTestingData(updatedHistory, updatedWeekly, updatedRainEvents);

    // Show user feedback about the test
    const dataSource = sensorData.demo ? ' (Demo Data)' : '';
    Alert.alert(
      'Water Test Recorded',
      `Test completed successfully!${dataSource}\n\n${sensorData.error ? 
        'Note: Sensor data could not be read' : 
        `TDS: ${sensorData.tds || 'N/A'} ppm\nVibration: ${sensorData.vibration || 'N/A'} m/s²`
      }`,
      [{ text: 'OK' }]
    );
  };

  const getWeekKey = (date) => {
    const year = date.getFullYear();
    const week = Math.ceil(
      ((date - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7
    );
    return `${year}-W${week}`;
  };

  const getCurrentWeekStatus = () => {
    const currentWeek = getWeekKey(new Date());
    return weeklyStatus[currentWeek];
  };

  const addRainEvent = () => {
    Alert.alert(
      'Record Rain Event',
      'When did it rain heavily?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Today',
          onPress: async () => {
            const rainDate = new Date();
            await createRainEvent(rainDate);
          }
        },
        {
          text: 'Yesterday', 
          onPress: async () => {
            const rainDate = new Date();
            rainDate.setDate(rainDate.getDate() - 1);
            await createRainEvent(rainDate);
          }
        },
        {
          text: 'Custom Date',
          onPress: () => {
            // For custom date, show another alert with date options
            showCustomDateOptions();
          }
        }
      ]
    );
  };

  const showCustomDateOptions = () => {
    Alert.alert(
      'Select Rain Date',
      'Choose how many days ago it rained:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '2 days ago', onPress: () => createRainEventDaysAgo(2) },
        { text: '3 days ago', onPress: () => createRainEventDaysAgo(3) },
        { text: '4 days ago', onPress: () => createRainEventDaysAgo(4) },
        { text: '5 days ago', onPress: () => createRainEventDaysAgo(5) },
        { text: 'This week', onPress: () => createRainEventDaysAgo(7) }
      ]
    );
  };

  const createRainEventDaysAgo = async (daysAgo) => {
    const rainDate = new Date();
    rainDate.setDate(rainDate.getDate() - daysAgo);
    await createRainEvent(rainDate);
  };

  const createRainEvent = async (rainDate) => {
    try {
      const newRainEvent = {
        id: Date.now(),
        date: rainDate.toISOString().split('T')[0],
        timestamp: rainDate.toISOString(),
        tested: false
      };

      const updatedRainEvents = [newRainEvent, ...rainEvents].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      setRainEvents(updatedRainEvents);
      await saveTestingData(testingHistory, weeklyStatus, updatedRainEvents);

      // Schedule post-rain notification
      await NotificationService.schedulePostRainNotification(rainDate);

      // Show confirmation
      Alert.alert(
        'Rain Event Added',
        `Rain event recorded for ${rainDate.toLocaleDateString()}. You'll receive a reminder to test your water quality.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to add rain event:', error);
      Alert.alert('Error', 'Failed to add rain event. Please try again.');
    }
  };

  const deleteRainEvent = (rainEvent) => {
    Alert.alert(
      'Delete Rain Event',
      `Remove rain event from ${new Date(rainEvent.date).toLocaleDateString()}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedRainEvents = rainEvents.filter(event => event.id !== rainEvent.id);
              setRainEvents(updatedRainEvents);
              await saveTestingData(testingHistory, weeklyStatus, updatedRainEvents);
              
              Alert.alert(
                'Rain Event Deleted',
                'Rain event has been removed successfully.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Failed to delete rain event:', error);
              Alert.alert('Error', 'Failed to delete rain event. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getUntestedRainEvents = () => {
    return rainEvents.filter(event => !event.tested);
  };

  const showTestDetails = (test) => {
    if (!test.sensorData) {
      Alert.alert('No Data', 'This test has no sensor data recorded.');
      return;
    }

    const data = test.sensorData;
    const dateStr = new Date(test.timestamp).toLocaleString();
    
    if (data.error) {
      Alert.alert(
        'Test Results',
        `Date: ${dateStr}\nType: ${test.testType === 'manual' ? 'Manual Test' : 'Automatic Test'}\n\nError: ${data.error}`,
        [{ text: 'OK' }]
      );
      return;
    }

    const message = `Date: ${dateStr}\nType: ${test.testType === 'manual' ? 'Manual Test' : 'Automatic Test'}\n\n` +
      `🔬 Water Quality Results:\n\n` +
      `TDS (Total Dissolved Solids): ${data.tds || 'N/A'} ppm\n` +
      `Vibration Level: ${data.vibration || 'N/A'} m/s²`;

    Alert.alert('Water Test Results', message, [
      { text: 'OK' },
      { 
        text: 'View on Sensor Screen', 
        onPress: () => navigation.navigate('ScreenTwo', { 
          highlightedTest: test,
          showTestResult: true 
        }) 
      }
    ]);
  };

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([
      loadTestingData(),
      loadScheduledNotifications(),
      loadNotificationServiceStatus()
    ]).then(() => setRefreshing(false));
  };

  const currentWeekStatus = getCurrentWeekStatus();
  const untestedRainEvents = getUntestedRainEvents();
  const recentTests = testingHistory.slice(0, 5);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Water Testing Checklist</Text>
      
      {/* Connection Status */}
      <View style={styles.statusCard}>
        <Text style={styles.cardTitle}>ESP32 Connection</Text>
        <Text style={styles.statusText}>
          {connectionStatus.isConnected 
            ? `✅ Connected to ${connectionStatus.deviceName}` 
            : '❌ Not Connected'
          }
        </Text>
        {!connectionStatus.isConnected && (
          <Text style={styles.warningText}>
            Connect to ESP32 to automatically record water tests
          </Text>
        )}
      </View>

      {/* Weekly Testing Status */}
      <View style={styles.statusCard}>
        <Text style={styles.cardTitle}>This Week's Testing</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[
            styles.statusValue,
            currentWeekStatus?.tested ? styles.statusComplete : styles.statusPending
          ]}>
            {currentWeekStatus?.tested ? '✅ Completed' : '⏳ Pending'}
          </Text>
        </View>
        {currentWeekStatus?.tested && (
          <Text style={styles.testDate}>
            Tested on: {new Date(currentWeekStatus.timestamp).toLocaleDateString()}
          </Text>
        )}
      </View>

      {/* Rain Events Status */}
      <View style={styles.statusCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Post-Rain Testing</Text>
          <TouchableOpacity style={styles.addButton} onPress={addRainEvent}>
            <Text style={styles.addButtonText}>+ Add Rain</Text>
          </TouchableOpacity>
        </View>
        
        {untestedRainEvents.length === 0 ? (
          <Text style={styles.statusComplete}>✅ All rain events tested</Text>
        ) : (
          <View>
            <Text style={styles.statusPending}>
              ⚠️ {untestedRainEvents.length} rain event(s) need testing
            </Text>
            <Text style={styles.helpText}>
              Tap ✕ to remove a rain event if added by mistake
            </Text>
            {untestedRainEvents.map(event => (
              <TouchableOpacity 
                key={event.id} 
                style={styles.rainEventItem}
                onLongPress={() => deleteRainEvent(event)}
              >
                <View style={styles.rainEventContent}>
                  <View style={styles.rainEventInfo}>
                    <Text style={styles.rainEventDate}>
                      Rain on: {new Date(event.date).toLocaleDateString()}
                    </Text>
                    <Text style={styles.rainEventStatus}>Awaiting test</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.deleteButton}
                    onPress={() => deleteRainEvent(event)}
                  >
                    <Text style={styles.deleteButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsCard}>
        <Text style={styles.cardTitle}>Quick Actions</Text>
        
        <View style={styles.buttonContainer}>
          <Button
            title="Go to Sensor Data Screen"
            onPress={() => navigation.navigate('ScreenTwo')}
            color="green"
          />
        </View>
        
        <View style={styles.buttonContainer}>
          <Button
            title={Constants.executionEnvironment === 'storeClient' ? 
              "Record Demo Test" : 
              connectionStatus.isConnected ? 
                "Record Sensor Test" : 
                "Connect Sensor First"
            }
            onPress={recordWaterTest}
            color={connectionStatus.isConnected ? "blue" : "gray"}
          />
        </View>
      </View>

      {/* Notification Status */}
      <View style={styles.statusCard}>
        <Text style={styles.cardTitle}>Notification Status</Text>
        
        {/* Service Status */}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Service:</Text>
          <Text style={[
            styles.statusValue,
            notificationServiceStatus.hasNotifications ? styles.statusComplete : styles.statusPending
          ]}>
            {notificationServiceStatus.hasNotifications 
              ? '✅ Active' 
              : notificationServiceStatus.isMockMode 
                ? '🧪 Mock Mode (Expo Go)' 
                : '❌ Unavailable'
            }
          </Text>
        </View>
        
        {notificationServiceStatus.isMockMode && (
          <Text style={styles.warningText}>
            Real notifications require a development build. In Expo Go, notifications are simulated.
          </Text>
        )}
        
        {/* Scheduled Notifications */}
        {scheduledNotifications.length === 0 ? (
          <Text style={styles.noDataText}>
            {notificationServiceStatus.isMockMode 
              ? 'Mock notifications scheduled (not visible in Expo Go)' 
              : 'No scheduled notifications'
            }
          </Text>
        ) : (
          <View>
            <Text style={styles.statusComplete}>
              ✅ {scheduledNotifications.length} notification(s) scheduled
            </Text>
            {scheduledNotifications.slice(0, 3).map((notification, index) => (
              <View key={index} style={styles.notificationItem}>
                <Text style={styles.notificationTitle}>
                  {notification.content.title}
                </Text>
                <Text style={styles.notificationTime}>
                  {notification.trigger.type === 'date' 
                    ? new Date(notification.trigger.value * 1000).toLocaleDateString()
                    : 'Weekly reminder'
                  }
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Recent Tests History */}
      <View style={styles.historyCard}>
        <Text style={styles.cardTitle}>Recent Tests</Text>
        {recentTests.length === 0 ? (
          <Text style={styles.noDataText}>No tests recorded yet</Text>
        ) : (
          recentTests.map(test => (
            <TouchableOpacity 
              key={test.id} 
              style={styles.historyItem}
              onPress={() => showTestDetails(test)}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>
                  {new Date(test.timestamp).toLocaleDateString()}
                </Text>
                <Text style={styles.historyTime}>
                  {new Date(test.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={styles.testType}>
                  {test.testType === 'manual' ? '👆 Manual' : '🔄 Auto'}
                </Text>
              </View>
              
              {test.sensorData && !test.sensorData.error ? (
                <View style={styles.sensorDataPreview}>
                  <Text style={styles.sensorDataText}>
                    TDS: {test.sensorData.tds || 'N/A'} ppm | Vibration: {test.sensorData.vibration || 'N/A'} m/s²
                  </Text>
                  <Text style={styles.tapHint}>Tap to view details</Text>
                </View>
              ) : (
                <Text style={styles.noSensorData}>
                  {test.sensorData?.error || 'No sensor data available'}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title="Back to Home"
          onPress={() => navigation.goBack()}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f8ff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1976d2',
  },
  statusCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionsCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  historyCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  statusLabel: {
    fontSize: 16,
    color: '#666',
    marginRight: 10,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusComplete: {
    color: '#4caf50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusPending: {
    color: '#ff9800',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 16,
    color: '#333',
  },
  warningText: {
    fontSize: 14,
    color: '#f44336',
    marginTop: 5,
    fontStyle: 'italic',
  },
  testDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  addButton: {
    backgroundColor: '#2196f3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rainEventItem: {
    backgroundColor: '#fff3cd',
    padding: 10,
    borderRadius: 5,
    marginTop: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  rainEventContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rainEventInfo: {
    flex: 1,
  },
  rainEventDate: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  rainEventStatus: {
    fontSize: 12,
    color: '#856404',
    marginTop: 2,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 5,
    marginBottom: 5,
  },
  buttonContainer: {
    marginVertical: 8,
  },
  historyItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#28a745',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDate: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
  historyTime: {
    fontSize: 12,
    color: '#666',
  },
  testType: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: 'bold',
  },
  sensorDataPreview: {
    backgroundColor: '#e9ecef',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  sensorDataText: {
    fontSize: 12,
    color: '#495057',
    fontFamily: 'monospace',
  },
  tapHint: {
    fontSize: 10,
    color: '#6c757d',
    fontStyle: 'italic',
    marginTop: 2,
    textAlign: 'center',
  },
  noSensorData: {
    fontSize: 12,
    color: '#dc3545',
    fontStyle: 'italic',
    marginTop: 4,
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  notificationItem: {
    backgroundColor: '#e3f2fd',
    padding: 8,
    borderRadius: 5,
    marginTop: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#2196f3',
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  notificationTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});