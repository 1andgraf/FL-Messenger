import React, { useState, useRef } from "react";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Platform,
} from "react-native";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const db = getFirestore();
const storage = getStorage();

export default function LoginScreen({ navigation, onLogin }) {
  const [isLogin, setIsLogin] = useState(true); // toggle login/signup
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [avatarBgColor, setAvatarBgColor] = useState("#2c2f37");

  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  // For animating background color
  const bgAnim = useRef(new Animated.Value(1)).current;

  const handleSubmit = async () => {
    if (isLogin) {
      if (!email || !password) {
        Alert.alert("Error", "Please fill all fields");
        return;
      }
      try {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user = userCredential?.user;
        if (!user || !user.uid) {
          Alert.alert("Login failed", "User information is missing.");
          return;
        }

        // Fetch Firestore user data
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let fetchedColor = "#2c2f37";

        let name = "";
        let nickname = "";
        if (userDoc.exists()) {
          const data = userDoc.data();
          name = data?.name || "";
          nickname = data?.nickname || "";
          fetchedColor = data?.avatarBgColor || "#2c2f37";
        }

        if (onLogin) {
          onLogin({
            name,
            nickname,
            email: user.email || "",
            avatarBgColor: fetchedColor,
          });
        }

        navigation.replace("MainApp");
      } catch (error) {
        Alert.alert("Login Error", error.message);
        console.log("Login error:", error);
      }
    } else {
      if (!name || !nickname || !email || !password || !confirmPassword) {
        Alert.alert("Error", "Please fill all fields");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Error", "Passwords do not match");
        return;
      }
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        let avatarUrl = null;
        if (avatar) {
          try {
            // Ensure avatar is a valid URI
            const uri = avatar.startsWith("file://") ? avatar : null;
            if (uri) {
              const response = await fetch(uri);
              const blob = await response.blob();

              const storageRef = ref(
                storage,
                `avatars/${userCredential.user.uid}.jpg`
              );
              await uploadBytes(storageRef, blob);

              avatarUrl = await getDownloadURL(storageRef);
            } else {
              console.log("Invalid avatar URI:", avatar);
            }
          } catch (err) {
            console.log("Firebase Storage upload error:", err);
            Alert.alert("Error uploading avatar", err.message);
          }
        }

        // Save Firestore data
        await setDoc(doc(db, "users", userCredential.user.uid), {
          name,
          nickname,
          email: userCredential.user.email,
          avatar: null, // letter avatar, no image
          avatarBgColor,
        });

        // Pass full user info to App.js including avatarBgColor
        if (onLogin) {
          onLogin({
            name,
            nickname,
            email: userCredential.user.email || "",
            avatar: null,
            avatarBgColor,
          });
        }

        navigation.replace("MainApp");
      } catch (error) {
        Alert.alert("Error", error.message);
      }
    }
  };

  // Interpolate background color: from lighter to main dark blue
  const bgColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#181a20", "#181a20"], // lighter blue to main bg
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor }]}>
      <Animated.View
        style={{
          opacity,
          transform: [{ scale }],
          flex: 1,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={styles.title}>
          {isLogin ? "Welcome to FL" : "Welcome to FL"}
        </Text>

        {!isLogin && (
          <>
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: avatarBgColor,
                alignSelf: "center",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 15,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 36, fontWeight: "bold" }}>
                {name ? name.charAt(0).toUpperCase() : ""}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                marginBottom: 30,
              }}
            >
              {[
                "#2c2f37",
                "#698cb7",
                "#b76b6b",
                "#6bb76b",
                "#b76bb7",
                "#b7a36b",
              ].map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setAvatarBgColor(color)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: color,
                    marginHorizontal: 6,
                    borderWidth: avatarBgColor === color ? 2 : 0,
                    borderColor: "#fff",
                  }}
                />
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#aaa"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Nickname"
              placeholderTextColor="#aaa"
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </>
        )}

        {isLogin && (
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#aaa"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {!isLogin && (
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor="#aaa"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        )}

        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>{isLogin ? "Login" : "Sign Up"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 0,
                duration: 50,
                useNativeDriver: true,
              }),
              Animated.timing(scale, {
                toValue: 0.95,
                duration: 50,
                useNativeDriver: true,
              }),
              Animated.timing(bgAnim, {
                toValue: 0,
                duration: 50,
                useNativeDriver: false,
              }),
            ]).start(() => {
              setIsLogin(!isLogin);
              Animated.parallel([
                Animated.timing(opacity, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: true,
                }),
                Animated.timing(scale, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: true,
                }),
                Animated.timing(bgAnim, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: false,
                }),
              ]).start();
            });
          }}
        >
          <Text style={styles.toggleText}>
            {isLogin ? (
              <Text style={styles.toggleText}>
                Don't have an account?{" "}
                <Text style={styles.toggleText1}>Sign Up</Text>
              </Text>
            ) : (
              <Text style={styles.toggleText}>
                Already have an account?{" "}
                <Text style={styles.toggleText1}>Log in</Text>
              </Text>
            )}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#181a20",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 30,
  },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#2c2f38",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    fontSize: 15,
    color: "#fff",
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#3d4e65ff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  toggleText: {
    color: "#aaa",
    fontSize: 16,
    textAlign: "center",
  },
  toggleText1: {
    color: "#698cb7ff",
    fontWeight: "bold",
  },
});
