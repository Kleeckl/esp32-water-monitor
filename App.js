// ...existing code...
import { BleManager } from 'react-native-ble-plx';
import { useState } from 'react';
import { Text, Alert } from 'react-native';

const manager = new BleManager();

function HomeScreen({ navigation }) {
  const [sensorData, setSensorData] = useState(null);

  const scanAndConnect = () => {
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        Alert.alert('Bluetooth Error', error.message);
        return;
      }
      // Replace 'SensorName' with your sensor's name or use device.id
      if (device && device.name === 'SensorName') {
        manager.stopDeviceScan();
        device.connect()
          .then((device) => device.discoverAllServicesAndCharacteristics())
          .then((device) => {
            // Replace with your sensor's service and characteristic UUIDs
            return device.readCharacteristicForService('service-uuid', 'characteristic-uuid');
          })
          .then((characteristic) => {
            const value = characteristic.value; // base64 encoded
            setSensorData(value);
          })
          .catch((error) => {
            Alert.alert('Connection Error', error.message);
          });
      }
    });
  };

  return (
    <View style={styles.container}>
      <Button
        title="Scan for Sensor"
        onPress={scanAndConnect}
      />
      {sensorData && <Text>Sensor Data: {sensorData}</Text>}
      <Button
        title="Go to Screen 1"
        onPress={() => navigation.navigate('ScreenOne')}
      />
      <Button
        title="Go to Screen 2"
        color="green"
        onPress={() => navigation.navigate('ScreenTwo')}
      />
      <Button
        title="Go to Screen 3"
        color="orange"
        onPress={() => navigation.navigate('ScreenThree')}
      />
    </View>
  );
}
// ...existing code...