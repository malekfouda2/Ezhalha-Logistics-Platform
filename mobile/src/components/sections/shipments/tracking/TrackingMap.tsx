import { useEffect, useRef, useMemo } from "react";
import { StyleSheet, View, Platform } from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  Region,
} from "react-native-maps";

import { Colors } from "@/constants/colors";
import { rs, rvs } from "@/utils/responsive";
import { TrackingCoordinate } from "@/lib/services/shipmentTracking";

interface TrackingMapProps {
  currentLocation: TrackingCoordinate;
  destination: TrackingCoordinate;
  origin?: TrackingCoordinate;
  height?: number;
}

export function TrackingMap({
  currentLocation,
  destination,
  origin,
  height = rvs(260),
}: TrackingMapProps) {
  const mapRef = useRef<MapView>(null);

  const coordinates = useMemo(() => {
    const list: TrackingCoordinate[] = [currentLocation, destination];
    if (origin) list.push(origin);
    return list;
  }, [currentLocation, destination, origin]);

  const initialRegion: Region = useMemo(() => {
    const lats = coordinates.map((c) => c.latitude);
    const lngs = coordinates.map((c) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latitudeDelta = Math.max((maxLat - minLat) * 1.8, 0.08);
    const longitudeDelta = Math.max((maxLng - minLng) * 1.8, 0.08);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta,
      longitudeDelta,
    };
  }, [coordinates]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: rvs(60),
        right: rs(60),
        bottom: rvs(60),
        left: rs(60),
      },
      animated: true,
    });
  }, [coordinates]);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {origin && (
          <Marker
            coordinate={origin}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.originDot} />
          </Marker>
        )}

        <Marker
          coordinate={currentLocation}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={styles.pinWrapper}>
            <View style={styles.pinGlow} />
            <View style={styles.pin}>
              <View style={styles.pinInnerDot} />
            </View>
            <View style={styles.pinTail} />
          </View>
        </Marker>
      </MapView>
    </View>
  );
}

const PIN_SIZE = rs(44);

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: rs(24),
    overflow: "hidden",
    backgroundColor: Colors.inputBackground,
  },
  originDot: {
    width: rs(18),
    height: rs(18),
    borderRadius: rs(9),
    backgroundColor: Colors.text,
    borderWidth: rs(3),
    borderColor: Colors.white,
  },
  pinWrapper: {
    alignItems: "center",
    justifyContent: "flex-end",
    width: PIN_SIZE * 1.8,
    height: PIN_SIZE * 1.8,
  },
  pinGlow: {
    position: "absolute",
    bottom: rs(6),
    width: PIN_SIZE * 1.8,
    height: PIN_SIZE * 1.8,
    borderRadius: (PIN_SIZE * 1.8) / 2,
    backgroundColor: Colors.primary,
    opacity: 0.18,
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: rs(3),
    borderColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pinInnerDot: {
    width: rs(14),
    height: rs(14),
    borderRadius: rs(7),
    backgroundColor: Colors.white,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: rs(7),
    borderRightWidth: rs(7),
    borderTopWidth: rs(10),
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: Colors.primary,
    marginTop: -rs(2),
  },
});