// navigation/MainNavigator.jsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ShipmentDetailsScreen from '../screens/shipments/Shipments';
import InvoiceDetailsScreen from '../screens/shipments/Shipments';
import NotificationsScreen from '../screens/shipments/Shipments';
import EditProfileScreen from '../screens/shipments/Shipments';
import AddShipmentScreen from '../screens/shipments/Shipments';
import TabNavigator from './TabNavigator';

const Stack = createNativeStackNavigator();

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="ShipmentDetails"
        component={ShipmentDetailsScreen}
        options={{ headerShown: true, title: 'Shipment Details' }}
      />
      <Stack.Screen
        name="InvoiceDetails"
        component={InvoiceDetailsScreen}
        options={{ headerShown: true, title: 'Invoice' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: 'Notifications' }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: true, title: 'Edit Profile' }}
      />
      {/* Modal-style, presented from the center "+" */}
      <Stack.Screen
        name="AddShipment"
        component={AddShipmentScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'New Shipment' }}
      />
    </Stack.Navigator>
  );
}