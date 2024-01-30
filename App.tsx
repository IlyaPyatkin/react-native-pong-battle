import "react-native-reanimated";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Grid from "./components/Grid";

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <Grid />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecf0f1",
  },
});
