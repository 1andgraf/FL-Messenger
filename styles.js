import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0c0d10ff",
    alignItems: "center",
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
  },
  screenText: {
    fontSize: 16,
    color: "#aaa",
  },
  tabBar: {
    backgroundColor: "#181a20",
    borderTopColor: "#333",
    borderTopWidth: 1,
    height: 90,
    paddingHorizontal: 0,
  },
  tabLabel: {
    fontSize: 14,
    marginTop: 12,
  },
  header: {
    backgroundColor: "#181a20",
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
});
