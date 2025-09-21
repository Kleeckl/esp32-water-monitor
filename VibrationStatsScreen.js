import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Button,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationService from './NotificationService';

// Import the appropriate service based on environment
let bluetoothService;
try {
  bluetoothService = require('./BluetoothService').default;
} catch (error) {
  bluetoothService = require('./SimulatedBluetoothService').default;
}

export default function VibrationStatsScreen({ navigation }) {
  const [vibrationData, setVibrationData] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState({});
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    deviceName: null
  });
  const [isCollecting, setIsCollecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [alertHistory, setAlertHistory] = useState([]);

  useEffect(() => {
    loadVibrationData();
    loadAlertHistory();
    
    // Get connection status
    const status = bluetoothService.getConnectionStatus();
    setConnectionStatus({
      isConnected: status.isConnected,
      deviceName: status.deviceName
    });

    // Set auto-monitoring to true since we want to automatically collect data
    setIsCollecting(true);

    // Subscribe to real-time data for automatic vibration monitoring
    const unsubscribe = bluetoothService.subscribe((event, data) => {
      switch (event) {
        case 'connected':
          setConnectionStatus({
            isConnected: true,
            deviceName: data.device.name
          });
          setIsCollecting(true); // Auto-start when connected
          break;
        case 'disconnected':
          setConnectionStatus({
            isConnected: false,
            deviceName: null
          });
          setIsCollecting(false);
          break;
        case 'dataReceived':
          // Automatically record vibration data when any sensor data is received
          if (data.data && data.data.vibration !== undefined) {
            recordVibrationReading(data.data);
          }
          break;
      }
    });

    return unsubscribe;
  }, []);

  const loadVibrationData = async () => {
    try {
      const [storedData, storedStats, storedAlerts] = await Promise.all([
        AsyncStorage.getItem('vibrationReadings'),
        AsyncStorage.getItem('vibrationWeeklyStats'),
        AsyncStorage.getItem('vibrationAlertHistory')
      ]);

      setVibrationData(storedData ? JSON.parse(storedData) : []);
      setWeeklyStats(storedStats ? JSON.parse(storedStats) : {});
      setAlertHistory(storedAlerts ? JSON.parse(storedAlerts) : []);
    } catch (error) {
      console.error('Error loading vibration data:', error);
    }
  };

  const loadAlertHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem('vibrationAlertHistory');
      setAlertHistory(stored ? JSON.parse(stored) : []);
    } catch (error) {
      console.error('Error loading alert history:', error);
    }
  };

  const saveVibrationData = async (data, stats, alerts) => {
    try {
      await Promise.all([
        AsyncStorage.setItem('vibrationReadings', JSON.stringify(data)),
        AsyncStorage.setItem('vibrationWeeklyStats', JSON.stringify(stats)),
        AsyncStorage.setItem('vibrationAlertHistory', JSON.stringify(alerts))
      ]);
    } catch (error) {
      console.error('Error saving vibration data:', error);
    }
  };

  const recordVibrationReading = (sensorData) => {
    const now = new Date();
    const timestamp = now.toISOString();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekKey = getWeekKey(now);

    // Extract vibration and individual axis values from sensor data
    const vibration = parseFloat(sensorData.vibration) || 0;
    const xAxis = parseFloat(sensorData.xAxis) || 0;
    const yAxis = parseFloat(sensorData.yAxis) || 0;
    const zAxis = parseFloat(sensorData.zAxis) || 0;

    const newReading = {
      id: Date.now(),
      timestamp,
      dateKey,
      weekKey,
      vibration,
      xAxis,
      yAxis,
      zAxis
    };

    // Add to readings array (keep last 1000 readings)
    const updatedData = [newReading, ...vibrationData.slice(0, 999)];
    
    // Calculate weekly statistics
    const updatedStats = calculateWeeklyStats(updatedData, weekKey);
    
    // Check for deviation alerts
    const updatedAlerts = checkForDeviationAlert(updatedStats, weekKey, alertHistory);

    setVibrationData(updatedData);
    setWeeklyStats(updatedStats);
    setAlertHistory(updatedAlerts);
    
    saveVibrationData(updatedData, updatedStats, updatedAlerts);
  };

  const getWeekKey = (date) => {
    const year = date.getFullYear();
    const week = Math.ceil(
      ((date - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7
    );
    return `${year}-W${week}`;
  };

  const calculateWeeklyStats = (data, currentWeek) => {
    // Filter data for current week
    const weekData = data.filter(reading => reading.weekKey === currentWeek);
    
    if (weekData.length === 0) {
      return {
        ...weeklyStats,
        [currentWeek]: {
          count: 0,
          averages: { total: 0, xAxis: 0, yAxis: 0, zAxis: 0 },
          standardDeviations: { total: 0, xAxis: 0, yAxis: 0, zAxis: 0 },
          lastUpdated: new Date().toISOString()
        }
      };
    }

    // Calculate averages
    const averages = {
      total: weekData.reduce((sum, r) => sum + r.vibration, 0) / weekData.length,
      xAxis: weekData.reduce((sum, r) => sum + r.xAxis, 0) / weekData.length,
      yAxis: weekData.reduce((sum, r) => sum + r.yAxis, 0) / weekData.length,
      zAxis: weekData.reduce((sum, r) => sum + r.zAxis, 0) / weekData.length
    };

    // Calculate standard deviations
    const standardDeviations = {
      total: Math.sqrt(weekData.reduce((sum, r) => sum + Math.pow(r.vibration - averages.total, 2), 0) / weekData.length),
      xAxis: Math.sqrt(weekData.reduce((sum, r) => sum + Math.pow(r.xAxis - averages.xAxis, 2), 0) / weekData.length),
      yAxis: Math.sqrt(weekData.reduce((sum, r) => sum + Math.pow(r.yAxis - averages.yAxis, 2), 0) / weekData.length),
      zAxis: Math.sqrt(weekData.reduce((sum, r) => sum + Math.pow(r.zAxis - averages.zAxis, 2), 0) / weekData.length)
    };

    return {
      ...weeklyStats,
      [currentWeek]: {
        count: weekData.length,
        averages,
        standardDeviations,
        lastUpdated: new Date().toISOString(),
        weekStart: weekData[weekData.length - 1]?.timestamp,
        weekEnd: weekData[0]?.timestamp
      }
    };
  };

  const checkForDeviationAlert = (stats, currentWeek, currentAlerts) => {
    const currentStats = stats[currentWeek];
    if (!currentStats || currentStats.count < 10) {
      // Need at least 10 readings before checking for deviations
      return currentAlerts;
    }

    const { averages, standardDeviations } = currentStats;
    
    // Check if any axis has >20% deviation (standard deviation > 20% of average)
    const deviationThreshold = 0.2; // 20%
    const alerts = [];

    ['total', 'xAxis', 'yAxis', 'zAxis'].forEach(axis => {
      const average = averages[axis];
      const stdDev = standardDeviations[axis];
      const deviationPercentage = average > 0 ? (stdDev / average) : 0;

      if (deviationPercentage > deviationThreshold) {
        const alertId = `${currentWeek}-${axis}-deviation`;
        
        // Check if we haven't already sent this alert today
        const today = new Date().toISOString().split('T')[0];
        const existingAlert = currentAlerts.find(alert => 
          alert.id === alertId && alert.date === today
        );

        if (!existingAlert) {
          const newAlert = {
            id: alertId,
            date: today,
            timestamp: new Date().toISOString(),
            week: currentWeek,
            axis,
            deviation: deviationPercentage,
            average: average,
            standardDeviation: stdDev,
            message: `${axis.toUpperCase()} vibration deviation: ${(deviationPercentage * 100).toFixed(1)}%`
          };

          alerts.push(newAlert);
          
          // Send notification
          NotificationService.scheduleVibrationAlert(newAlert);
        }
      }
    });

    if (alerts.length > 0) {
      return [...alerts, ...currentAlerts].slice(0, 50); // Keep last 50 alerts
    }

    return currentAlerts;
  };

  const clearOldData = () => {
    Alert.alert(
      'Clear Old Data',
      'Remove vibration data older than 2 weeks?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
            
            const filteredData = vibrationData.filter(reading => 
              new Date(reading.timestamp) > twoWeeksAgo
            );
            
            setVibrationData(filteredData);
            
            // Recalculate stats
            const currentWeek = getWeekKey(new Date());
            const updatedStats = calculateWeeklyStats(filteredData, currentWeek);
            setWeeklyStats(updatedStats);
            
            await saveVibrationData(filteredData, updatedStats, alertHistory);
            
            Alert.alert('Success', 'Old vibration data cleared.');
          }
        }
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([
      loadVibrationData(),
      loadAlertHistory()
    ]).then(() => setRefreshing(false));
  };

  const getCurrentWeekStats = () => {
    const currentWeek = getWeekKey(new Date());
    return weeklyStats[currentWeek];
  };

  const getRecentAlerts = () => {
    return alertHistory.slice(0, 5); // Show last 5 alerts
  };

  // Simple chart component using React Native Views
  const SimpleChart = ({ data, title }) => {
    if (!data || data.length === 0) {
      return (
        <View style={styles.simpleChartContainer}>
          <Text style={styles.chartTitle}>{title}</Text>
          <Text style={styles.noDataText}>No data available</Text>
        </View>
      );
    }

    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue || 1;

    return (
      <View style={styles.simpleChartContainer}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.chartArea}>
          {data.map((point, index) => {
            const height = ((point.value - minValue) / range) * 100;
            return (
              <View key={index} style={styles.chartColumn}>
                <View style={styles.chartBarContainer}>
                  <View 
                    style={[
                      styles.chartBar, 
                      { 
                        height: `${Math.max(height, 5)}%`,
                        backgroundColor: point.color 
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.chartLabel}>{point.label}</Text>
                <Text style={styles.chartValue}>{point.value.toFixed(3)}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.chartAxisLabels}>
          <Text style={styles.axisLabel}>Min: {minValue.toFixed(3)}</Text>
          <Text style={styles.axisLabel}>Max: {maxValue.toFixed(3)}</Text>
        </View>
      </View>
    );
  };

  const getChartData = () => {
    const recentData = vibrationData.slice(0, 10).reverse();
    return recentData.map((reading, index) => ({
      label: new Date(reading.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      value: reading.vibration || 0,
      color: '#4caf50'
    }));
  };

  const currentStats = getCurrentWeekStats();
  const recentAlerts = getRecentAlerts();

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Vibration Baseline Statistics</Text>
      
      {/* Connection Status */}
      <View style={styles.statusCard}>
        <Text style={styles.cardTitle}>ESP32 Connection</Text>
        <Text style={styles.statusText}>
          {connectionStatus.isConnected 
            ? `✅ Connected to ${connectionStatus.deviceName}` 
            : '❌ Not Connected'
          }
        </Text>
      </View>

      {/* Monitoring Status */}
      <View style={styles.controlsCard}>
        <Text style={styles.cardTitle}>Vibration Monitoring</Text>
        
        <View style={styles.statusInfo}>
          <Text style={styles.statusLabel}>Auto-Collection Status:</Text>
          <Text style={[
            styles.statusValue,
            isCollecting && connectionStatus.isConnected ? styles.statusActive : styles.statusInactive
          ]}>
            {connectionStatus.isConnected 
              ? (isCollecting ? '🟢 Active - Auto-collecting from sensor data' : '🟡 Connected but not collecting')
              : '🔴 Not Connected'
            }
          </Text>
        </View>
        
        <Text style={styles.infoText}>
          Total readings collected: {vibrationData.length}
        </Text>
        
        <Text style={styles.helpText}>
          💡 Vibration data is automatically collected when you use "Start Collection" 
          on the Sensor Data screen. No manual action needed here.
        </Text>
      </View>

      {/* Current Week Statistics */}
      <View style={styles.statsCard}>
        <Text style={styles.cardTitle}>This Week's Statistics</Text>
        
        {currentStats ? (
          <View>
            <Text style={styles.statsInfo}>
              Readings: {currentStats.count} | Last updated: {new Date(currentStats.lastUpdated).toLocaleString()}
            </Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total Vibration</Text>
                <Text style={styles.statValue}>
                  Avg: {currentStats.averages.total.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statDeviation}>
                  σ: ±{currentStats.standardDeviations.total.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statPercentage}>
                  ({currentStats.averages.total > 0 ? ((currentStats.standardDeviations.total / currentStats.averages.total) * 100).toFixed(1) : '0.0'}%)
                </Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>X-Axis</Text>
                <Text style={styles.statValue}>
                  Avg: {currentStats.averages.xAxis.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statDeviation}>
                  σ: ±{currentStats.standardDeviations.xAxis.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statPercentage}>
                  ({currentStats.averages.xAxis > 0 ? ((currentStats.standardDeviations.xAxis / currentStats.averages.xAxis) * 100).toFixed(1) : '0.0'}%)
                </Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Y-Axis</Text>
                <Text style={styles.statValue}>
                  Avg: {currentStats.averages.yAxis.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statDeviation}>
                  σ: ±{currentStats.standardDeviations.yAxis.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statPercentage}>
                  ({currentStats.averages.yAxis > 0 ? ((currentStats.standardDeviations.yAxis / currentStats.averages.yAxis) * 100).toFixed(1) : '0.0'}%)
                </Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Z-Axis</Text>
                <Text style={styles.statValue}>
                  Avg: {currentStats.averages.zAxis.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statDeviation}>
                  σ: ±{currentStats.standardDeviations.zAxis.toFixed(3)} m/s²
                </Text>
                <Text style={styles.statPercentage}>
                  ({currentStats.averages.zAxis > 0 ? ((currentStats.standardDeviations.zAxis / currentStats.averages.zAxis) * 100).toFixed(1) : '0.0'}%)
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.noDataText}>
            No data collected this week. Start monitoring to collect baseline statistics.
          </Text>
        )}
      </View>

      {/* Vibration Graph */}
      <View style={styles.graphCard}>
        <Text style={styles.cardTitle}>Recent Vibration Trends</Text>
        
        {vibrationData.length > 0 ? (
          <View>
            <SimpleChart 
              data={getChartData()} 
              title="Total Vibration (Last 10 Readings)"
            />
            
            {/* Recent Values Summary */}
            <View style={styles.recentValuesContainer}>
              <Text style={styles.recentValuesTitle}>Latest Reading:</Text>
              {vibrationData[0] && (
                <View style={styles.latestReadingGrid}>
                  <View style={styles.latestReadingItem}>
                    <Text style={styles.latestLabel}>Total</Text>
                    <Text style={[styles.latestValue, { color: '#4caf50' }]}>
                      {vibrationData[0].vibration?.toFixed(3) || '0.000'} m/s²
                    </Text>
                  </View>
                  <View style={styles.latestReadingItem}>
                    <Text style={styles.latestLabel}>X-Axis</Text>
                    <Text style={[styles.latestValue, { color: '#f44336' }]}>
                      {vibrationData[0].xAxis?.toFixed(3) || '0.000'} m/s²
                    </Text>
                  </View>
                  <View style={styles.latestReadingItem}>
                    <Text style={styles.latestLabel}>Y-Axis</Text>
                    <Text style={[styles.latestValue, { color: '#2196f3' }]}>
                      {vibrationData[0].yAxis?.toFixed(3) || '0.000'} m/s²
                    </Text>
                  </View>
                  <View style={styles.latestReadingItem}>
                    <Text style={styles.latestLabel}>Z-Axis</Text>
                    <Text style={[styles.latestValue, { color: '#ff9800' }]}>
                      {vibrationData[0].zAxis?.toFixed(3) || '0.000'} m/s²
                    </Text>
                  </View>
                </View>
              )}
            </View>
            
            <Text style={styles.graphInfo}>
              📊 Showing last {Math.min(vibrationData.length, 10)} readings as bar chart. 
              Collect more data to see vibration trends over time.
            </Text>
          </View>
        ) : (
          <View style={styles.noGraphData}>
            <Text style={styles.noDataText}>
              📈 No vibration data to display yet.
            </Text>
            <Text style={styles.helpText}>
              Start collecting sensor data to see vibration trends over time.
            </Text>
          </View>
        )}
      </View>

      {/* Alert History */}
      <View style={styles.alertCard}>
        <Text style={styles.cardTitle}>Recent Deviation Alerts</Text>
        
        {recentAlerts.length === 0 ? (
          <Text style={styles.noDataText}>No alerts yet. Good vibration stability! ✅</Text>
        ) : (
          recentAlerts.map(alert => (
            <TouchableOpacity key={alert.id} style={styles.alertItem}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertDate}>
                  {new Date(alert.timestamp).toLocaleDateString()}
                </Text>
                <Text style={styles.alertAxis}>{alert.axis.toUpperCase()}</Text>
              </View>
              <Text style={styles.alertMessage}>{alert.message}</Text>
              <Text style={styles.alertAction}>
                Action: Check screws and remove obstructions
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Data Management */}
      <View style={styles.actionsCard}>
        <Text style={styles.cardTitle}>Data Management</Text>
        
        <View style={styles.buttonContainer}>
          <Button
            title="Clear Old Data (>2 weeks)"
            onPress={clearOldData}
            color="orange"
          />
        </View>
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
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#2e7d32',
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
  controlsCard: {
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
  statsCard: {
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
  alertCard: {
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
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  statusText: {
    fontSize: 16,
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  statusInfo: {
    marginBottom: 15,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusActive: {
    color: '#4caf50',
  },
  statusInactive: {
    color: '#ff9800',
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
    backgroundColor: '#e3f2fd',
    padding: 10,
    borderRadius: 5,
  },
  buttonContainer: {
    marginVertical: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  statsInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    width: '48%',
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  statDeviation: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  statPercentage: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: 'bold',
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  alertItem: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  alertDate: {
    fontSize: 12,
    color: '#666',
  },
  alertAxis: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#856404',
  },
  alertMessage: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 5,
  },
  alertAction: {
    fontSize: 12,
    color: '#dc3545',
    fontWeight: 'bold',
  },
  graphCard: {
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
  chart: {
    marginVertical: 8,
    borderRadius: 10,
  },
  legendContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  graphInfo: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  noGraphData: {
    alignItems: 'center',
    padding: 20,
  },
  chartContainer: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginVertical: 10,
  },
  chartPlaceholder: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  debugInfo: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  simpleChartContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginVertical: 10,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 120,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingHorizontal: 5,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  chartBarContainer: {
    height: 80,
    justifyContent: 'flex-end',
    width: '80%',
  },
  chartBar: {
    backgroundColor: '#4caf50',
    borderRadius: 2,
    minHeight: 5,
    width: '100%',
  },
  chartLabel: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
    transform: [{ rotate: '-45deg' }],
  },
  chartValue: {
    fontSize: 10,
    color: '#333',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  chartAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  axisLabel: {
    fontSize: 12,
    color: '#666',
  },
  recentValuesContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  recentValuesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  latestReadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  latestReadingItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 10,
  },
  latestLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
  },
  latestValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});