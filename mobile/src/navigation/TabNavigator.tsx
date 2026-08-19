// navigation/TabNavigator.jsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Pressable, StyleSheet } from 'react-native';
// import { Ionicons } from '@expo/vector-icons'; // or lucide-react-native

import HomeScreen from '../screens/Home';
import ShipmentsScreen from '../screens/shipments/Shipments';
import InvoicesScreen from '../screens/shipments/Shipments';
import ProfileScreen from '../screens/shipments/Shipments';

const Tab = createBottomTabNavigator();
const ORANGE = '#F5641E';

// Dummy screen — tab press is intercepted to open a modal instead
function AddPlaceholder() {
  return null;
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: '#8A8F98',
        tabBarStyle: { height: 88, paddingTop: 8 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: 'home-outline',
            Shipments: 'cube-outline',
            Invoices: 'document-text-outline',
            Profile: 'person-outline',
          };
        //   return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shipments" component={ShipmentsScreen} />

      <Tab.Screen
        name="Add"
        component={AddPlaceholder}
        options={{
          tabBarIcon: () => (
            <View style={styles.fab}>
              {/* <Ionicons name="add" size={28} color="#fff" /> */}
            </View>
          ),
          tabBarLabel: () => null,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault(); // stop it becoming an actual tab
            navigation.navigate('AddShipment');
          },
        })}
      />

      <Tab.Screen name="Invoices" component={InvoicesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F5641E',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -20,
    shadowColor: '#F5641E',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});