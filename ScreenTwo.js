import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ScreenTwo() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>This is Screen Two</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
  },
});
