import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React, { useRef, useState, useLayoutEffect } from "react";
import QRCode from "react-native-qrcode-svg";
import { BlurView } from "expo-blur";
import {
  Text,
  View,
  TextInput,
  Animated,
  TouchableOpacity,
  Modal,
  Linking,
  Image,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  AppState,
  PanResponder,
  Clipboard,
  Alert,
} from "react-native";
import {
  NavigationContainer,
  DarkTheme,
  useFocusEffect,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// Inline ProfileScreen component
function ProfileScreen({ route, navigation }) {
  const { user } = route.params;
  const [userData, setUserData] = React.useState(null);
  const db = getFirestore();

  React.useEffect(() => {
    const fetchUserData = async () => {
      try {
        const uidToFetch = user?.uid || user?.id;
        if (!uidToFetch) {
          console.warn("Cannot fetch user profile: UID is undefined");
          return;
        }
        const userDoc = await getDoc(doc(db, "users", uidToFetch));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      } catch (e) {
        console.error("Error fetching user profile:", e);
      }
    };
    fetchUserData();
  }, [user]);

  const displayData = userData || user || {};

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0D0D14",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: displayData.avatarBgColor || "#3A3A3A",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Text style={{ fontSize: 48, color: "white" }}>
          {displayData.avatarSymbol ||
            displayData.name?.charAt(0)?.toUpperCase() ||
            "?"}
        </Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "white" }}>
        {displayData.name}
      </Text>
      <Text style={{ fontSize: 18, color: "#AAA", marginTop: 5 }}>
        @{displayData.nickname || ""}
      </Text>
      <TouchableOpacity
        style={{
          marginTop: 40,
          backgroundColor: "#1E1E2A",
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 10,
        }}
        onPress={() => navigation.goBack()}
      >
        <Text style={{ color: "white", fontSize: 16 }}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

import LoginScreen from "./LoginScreen";
import styles from "./styles";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  onSnapshot,
  addDoc,
  setDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { auth } from "./firebase";

function ChatsScreen({ navigation, route }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [listVisible, setListVisible] = useState(false);
  const listAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef(null);

  // Real user data from Firestore
  const [allUsers, setAllUsers] = useState([]);
  const db = getFirestore();

  // Chat swipe state
  const [swipedChatId, setSwipedChatId] = useState(null);
  const chatRefs = React.useRef({});

  // PanResponder factory for chat swipes
  function createChatPanResponder(chat, translateX) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderMove: (evt, gestureState) => {
        translateX.setValue(gestureState.dx);
        setSwipedChatId(chat.id);
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Left swipe: delete chat
        if (gestureState.dx < -50) {
          handleDeleteChat(chat);
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setSwipedChatId(null));
        }
        // Right swipe: pin/unpin chat
        else if (gestureState.dx > 50) {
          if (chat.pinned) {
            handleUnpinChat(chat);
          } else {
            handlePinChat(chat);
          }
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setSwipedChatId(null));
        }
        // Otherwise, reset
        else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setSwipedChatId(null));
        }
      },
    });
  }

  // Chat action handlers
  const handleDeleteChat = async (chat) => {
    try {
      const { deleteDoc, doc: firestoreDoc } = await import(
        "firebase/firestore"
      );
      await deleteDoc(firestoreDoc(db, "chats", chat.id));
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const handlePinChat = async (chat) => {
    try {
      const { updateDoc, doc: firestoreDoc } = await import(
        "firebase/firestore"
      );
      await updateDoc(firestoreDoc(db, "chats", chat.id), {
        pinned: true,
        pinnedAt: Date.now(),
      });
      // The real-time listener will automatically update the chat list
    } catch (error) {
      console.error("Error pinning chat:", error);
    }
  };

  const handleUnpinChat = async (chat) => {
    try {
      const { updateDoc, doc: firestoreDoc } = await import(
        "firebase/firestore"
      );
      await updateDoc(firestoreDoc(db, "chats", chat.id), {
        pinned: false,
        pinnedAt: null,
      });
      // The real-time listener will automatically update the chat list
    } catch (error) {
      console.error("Error unpinning chat:", error);
    }
  };

  // Inside ChatsScreen component (below your current imports and hooks)
  const [chats, setChats] = useState([]);
  const [chatPartners, setChatPartners] = useState({});
  const currentUid = auth.currentUser?.uid;

  React.useEffect(() => {
    const chatsRef = collection(db, "chats");
    // Store message unsubscribers so we can clean up
    let messageUnsubscribers = [];
    // Track if component is mounted
    let isMounted = true;
    // Helper to clean up all listeners
    function cleanup() {
      messageUnsubscribers.forEach((unsub) => unsub && unsub());
      messageUnsubscribers = [];
    }
    const unsubscribeChats = onSnapshot(chatsRef, async (snapshot) => {
      try {
        cleanup();
        const userChats = [];
        const chatDocs = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.participants?.includes(currentUid)) {
            userChats.push({
              id: docSnap.id,
              name: data.chatName || "Chat",
              avatarBgColor: data.avatarBgColor || "#6457a0ff",
              lastMessage: "",
              lastMessageTime: null,
              pinned: data.pinned || false,
              pinnedAt: data.pinnedAt || null,
            });
            chatDocs.push(docSnap);
          }
        });
        // Prepare a map for chat partner data
        const partnerData = {};
        for (const chat of userChats) {
          try {
            const chatDoc = await getDoc(doc(db, "chats", chat.id));
            if (chatDoc.exists()) {
              const data = chatDoc.data();
              const partnerId = data.participants?.find(
                (id) => id !== currentUid
              );
              if (partnerId) {
                const userDoc = await getDoc(doc(db, "users", partnerId));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  partnerData[chat.id] = {
                    name: userData.name || "User",
                    avatarBgColor: userData.avatarBgColor || "#6457a0ff",
                  };
                }
              }
            }
          } catch (e) {
            console.error("Error fetching partner for chat:", e);
          }
        }
        if (!isMounted) return;
        setChatPartners(partnerData);
        // For each chat, set up a messages onSnapshot to always get the latest message
        // We'll keep a local variable to store userChats with updated last message
        let updatedChats = [...userChats];
        chatDocs.forEach((docSnap, idx) => {
          const chatId = docSnap.id;
          const messagesRef = collection(db, "chats", chatId, "messages");
          // Listen for all messages ordered by timestamp desc to get last message and unread count
          const unsub = onSnapshot(
            query(messagesRef, orderBy("timestamp", "desc")),
            (msgSnapshot) => {
              if (!isMounted) return;

              let lastMessage = "";
              let lastMessageTime = null;
              let unreadCount = 0;

              msgSnapshot.forEach((msgDoc) => {
                const msgData = msgDoc.data();
                if (!lastMessage) {
                  lastMessage = msgData.text || "";
                  lastMessageTime = msgData.timestamp || null;
                }
                if (msgData.senderId !== currentUid && msgData.read === false) {
                  unreadCount++;
                }
              });

              updatedChats = updatedChats.map((c) =>
                c.id === chatId
                  ? { ...c, lastMessage, lastMessageTime, unreadCount }
                  : c
              );

              const sortedChats = [...updatedChats].sort((a, b) => {
                // Pinned chats always come first
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;

                // If both are pinned or both are not pinned, sort by last message time
                if (b.lastMessageTime && a.lastMessageTime) {
                  return b.lastMessageTime - a.lastMessageTime;
                }
                if (b.lastMessageTime) return 1;
                if (a.lastMessageTime) return -1;
                return 0;
              });

              setChats(sortedChats);
            }
          );
          messageUnsubscribers.push(unsub);
        });
        // If no chats, clear chats state
        if (userChats.length === 0) {
          setChats([]);
        }
      } catch (error) {
        console.error("Error fetching chats:", error);
      }
    });
    return () => {
      isMounted = false;
      cleanup();
      unsubscribeChats();
    };
  }, []);

  React.useEffect(() => {
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const usersList = [];
        const currentUid = auth.currentUser?.uid;

        querySnapshot.forEach((doc) => {
          if (doc.id !== currentUid) {
            const data = doc.data();
            usersList.push({
              id: doc.id,
              name: data.name || "",
              nickname: data.nickname || "",
              handle: data.handle || "",
              avatarBgColor: data.avatarBgColor || "#6457a0ff",
            });
          }
        });
        setAllUsers(usersList);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      opacity.setValue(0);
      scale.setValue(0.95);
      headerOpacity.setValue(0);
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
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }, [opacity, scale, headerOpacity])
  );

  // Expose headerOpacity and search handlers for use in headerTitle
  React.useEffect(() => {
    if (navigation && navigation.setParams) {
      navigation.setParams({
        headerOpacity,
        onSearchFocus: () => setSearchActive(true),
        onSearchBlur: () => setSearchActive(false),
        onSearchTextChange: (text) => setSearchText(text),
        searchText,
        searchInputRef, // <-- pass the ref through params
      });
    }
    // eslint-disable-next-line
  }, [headerOpacity, navigation, searchText, searchInputRef]);

  // Show user list if search is focused or contains text
  React.useEffect(() => {
    const shouldShow = searchActive || searchText.length > 0;
    if (shouldShow) {
      setUserResults(
        allUsers
          .filter(
            (user) =>
              user.name?.toLowerCase().includes(searchText.toLowerCase()) ||
              user.nickname?.toLowerCase().includes(searchText.toLowerCase())
          )
          .slice(0, 5)
      );
      setListVisible(true);
      Animated.timing(listAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(listAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setListVisible(false);
        setUserResults([]);
      });
    }
  }, [searchActive, searchText, allUsers]);

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        // Only deactivate search if it is currently active
        if (searchActive) {
          setSearchActive(false);
          Keyboard.dismiss();
        }
      }}
    >
      <Animated.View
        style={[styles.container, { opacity, transform: [{ scale }] }]}
      >
        {/* Main chat area under header */}
        {listVisible ? (
          <Animated.View
            style={{
              opacity: listAnim,
              transform: [
                {
                  translateY: listAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
              marginTop: 0,
              width: "100%",
            }}
          >
            <ScrollView
              style={{ width: "100%", height: 400, paddingTop: 15 }}
              contentContainerStyle={{
                paddingHorizontal: 10,
                paddingBottom: 20,
              }}
              showsVerticalScrollIndicator={false}
            >
              {userResults.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={{
                    backgroundColor: "#23242aff",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 10,
                    marginHorizontal: 10,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                  onPress={async () => {
                    try {
                      const chatsRef = collection(db, "chats");
                      const snapshot = await getDocs(chatsRef);
                      let existingChat = null;
                      snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        if (
                          data.participants &&
                          data.participants.includes(currentUid) &&
                          data.participants.includes(user.id)
                        ) {
                          existingChat = { id: docSnap.id };
                        }
                      });
                      let chatId;
                      if (existingChat) {
                        chatId = existingChat.id;
                      } else {
                        const newChatRef = await addDoc(
                          collection(db, "chats"),
                          {
                            participants: [currentUid, user.id],
                            createdAt: Date.now(),
                          }
                        );
                        chatId = newChatRef.id;
                      }
                      navigation.navigate("ChatView", {
                        chatId,
                        chatName: user.name,
                      });
                    } catch (error) {
                      console.error("Error opening or creating chat:", error);
                    }
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: user.avatarBgColor || "#6457a0ff",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 18,
                        fontWeight: "bold",
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 17,
                        fontWeight: "bold",
                      }}
                    >
                      {user.name}
                    </Text>
                    <Text
                      style={{
                        color: "#adadadff",
                        fontSize: 15,
                        marginTop: 3,
                      }}
                    >
                      @{user.nickname}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        ) : (
          <ScrollView
            style={{ width: "100%", paddingTop: 15 }}
            contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
          >
            {chats.map((chat) => {
              // Create animated value for each chat
              if (!chatRefs.current[chat.id]) {
                chatRefs.current[chat.id] = new Animated.Value(0);
              }
              const translateX = chatRefs.current[chat.id];
              const panResponder = createChatPanResponder(chat, translateX);

              // Interpolated opacities for swipe icons
              const deleteOpacity = translateX.interpolate({
                inputRange: [-100, -50],
                outputRange: [1, 0],
                extrapolate: "clamp",
              });
              const pinOpacity = translateX.interpolate({
                inputRange: [50, 100],
                outputRange: [0, 1],
                extrapolate: "clamp",
              });

              return (
                <View
                  key={chat.id}
                  style={{ position: "relative", marginVertical: 0 }}
                >
                  {/* Delete icon (left) */}
                  <Animated.View
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: deleteOpacity,
                      zIndex: 0,
                      width: 40,
                    }}
                    pointerEvents="none"
                  >
                    <Ionicons name="trash-outline" size={24} color="#ff4444" />
                  </Animated.View>

                  {/* Pin/Unpin icon (right) */}
                  <Animated.View
                    style={{
                      position: "absolute",
                      right: 330,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: pinOpacity,
                      zIndex: 0,
                      width: 40,
                    }}
                    pointerEvents="none"
                  >
                    <Ionicons
                      name={chat.pinned ? "pin" : "pin"}
                      size={24}
                      color={chat.pinned ? "red" : "#FFD700"}
                    />
                  </Animated.View>

                  <Animated.View
                    {...panResponder.panHandlers}
                    style={{
                      transform: [{ translateX }],
                      backgroundColor: "#23242aff",
                      borderRadius: 18,
                      padding: 14,
                      marginBottom: 10,
                      marginHorizontal: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      zIndex: 1,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("ChatView", {
                          chatId: chat.id,
                          chatName: chatPartners[chat.id]?.name || chat.name,
                        })
                      }
                      onLongPress={() => {
                        if (chat.pinned) {
                          handleUnpinChat(chat);
                        }
                      }}
                      delayLongPress={500}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor:
                            chatPartners[chat.id]?.avatarBgColor ||
                            chat.avatarBgColor,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 14,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 18,
                            fontWeight: "bold",
                          }}
                        >
                          {(chatPartners[chat.id]?.name || chat.name)
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 17,
                            fontWeight: "bold",
                          }}
                        >
                          {chatPartners[chat.id]?.name || chat.name}
                        </Text>
                        <Text
                          style={{
                            color: "#adadadff",
                            fontSize: 14,
                            marginTop: 3,
                          }}
                        >
                          {chat.lastMessage || "No messages yet"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          {chat.pinned && (
                            <Ionicons
                              name="pin"
                              size={12}
                              color="#FFD700"
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <Text
                            style={{
                              color: "#7c8598ff",
                              fontSize: 12,
                              marginBottom: 5,
                            }}
                          >
                            {chat.lastMessageTime
                              ? new Date(
                                  chat.lastMessageTime
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                })
                              : ""}
                          </Text>
                        </View>
                        {chat.unreadCount > 0 && (
                          <View
                            style={{
                              backgroundColor: "#ea5454ff",
                              borderRadius: 12,
                              minWidth: 24,
                              height: 24,
                              justifyContent: "center",
                              alignItems: "center",
                              paddingHorizontal: 6,
                              marginTop: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: "white",
                                fontSize: 12,
                                fontWeight: "bold",
                                textAlign: "center",
                              }}
                            >
                              {chat.unreadCount}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

function ChatViewScreen({ route, navigation }) {
  const { chatId, chatName } = route.params;
  const db = getFirestore();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  // Partner state for name and avatar color
  const [partner, setPartner] = useState({
    name: "",
    avatarBgColor: "#6457a0ff",
  });
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);
  // Reply state
  const [replyTo, setReplyTo] = useState(null);
  // Track which message is being dragged
  const [draggingMessageId, setDraggingMessageId] = useState(null);
  // Message options modal state
  const [messageOptionsVisible, setMessageOptionsVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [selectedMessagePosition, setSelectedMessagePosition] = useState({
    x: 0,
    y: 0,
  });
  const [selectedMessageLayout, setSelectedMessageLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  // Pinned message state
  const [pinnedMessage, setPinnedMessage] = useState(null);

  // Store animated values for each message id
  const messageRefs = React.useRef({});

  // Message options handlers
  const handleMessageLongPress = (message, event) => {
    const { pageX, pageY } = event.nativeEvent;
    setSelectedMessage(message);
    setSelectedMessagePosition({ x: pageX, y: pageY });

    // Calculate the message position relative to the screen
    const messageX = pageX - 100; // Approximate message center
    const messageY = pageY - 20; // Approximate message top

    setSelectedMessageLayout({
      x: messageX,
      y: messageY,
      width: 200,
      height: 50,
    });

    setMessageOptionsVisible(true);
  };

  const handleSaveMessage = async () => {
    if (!selectedMessage) return;
    try {
      // Add to saved messages collection
      await addDoc(
        collection(db, "users", auth.currentUser.uid, "savedMessages"),
        {
          messageId: selectedMessage.id,
          chatId: chatId,
          text: selectedMessage.text,
          senderId: selectedMessage.senderId,
          timestamp: selectedMessage.timestamp,
          savedAt: Date.now(),
        }
      );
      setMessageOptionsVisible(false);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      const { deleteDoc, doc: firestoreDoc } = await import(
        "firebase/firestore"
      );
      await deleteDoc(
        firestoreDoc(db, "chats", chatId, "messages", selectedMessage.id)
      );
      setMessageOptionsVisible(false);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const handleReplyToMessage = () => {
    if (!selectedMessage) return;
    setReplyTo(selectedMessage);
    setMessageOptionsVisible(false);
  };

  const handleForwardMessage = () => {
    if (!selectedMessage) return;
    // For now, just close the menu. In a real app, you'd navigate to a contact picker
    setMessageOptionsVisible(false);
  };

  const handleCopyMessage = async () => {
    if (!selectedMessage) return;
    try {
      await Clipboard.setString(selectedMessage.text);
      setMessageOptionsVisible(false);
    } catch (error) {
      console.error("Error copying message:", error);
    }
  };

  const handlePinMessage = async () => {
    if (!selectedMessage) return;
    try {
      // Update the message to mark it as pinned
      const { updateDoc, doc: firestoreDoc } = await import(
        "firebase/firestore"
      );
      await updateDoc(
        firestoreDoc(db, "chats", chatId, "messages", selectedMessage.id),
        {
          pinned: true,
          pinnedAt: Date.now(),
        }
      );
      setMessageOptionsVisible(false);
    } catch (error) {
      console.error("Error pinning message:", error);
    }
  };

  // Keyboard listeners to scroll to end when keyboard opens
  React.useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {}
    );
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  React.useEffect(() => {
    const fetchPartner = async () => {
      try {
        const chatDoc = await getDoc(doc(db, "chats", chatId));
        if (chatDoc.exists()) {
          const data = chatDoc.data();
          const partnerId = data.participants?.find(
            (id) => id !== auth.currentUser.uid
          );
          if (partnerId) {
            const userDoc = await getDoc(doc(db, "users", partnerId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setPartner({
                uid: partnerId,
                name: userData.name || "User",
                avatarBgColor: userData.avatarBgColor || "#6457a0ff",
                lastSeen: userData.lastSeen || null,
              });
            }
          }
        }
      } catch (error) {
        console.error("Error fetching chat partner:", error);
      }
    };
    fetchPartner();
  }, [chatId]);

  React.useEffect(() => {
    const messagesRef = collection(db, "chats", chatId, "messages");
    const unsubscribe = onSnapshot(messagesRef, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));

      // Find pinned message
      const pinned = msgs.find((msg) => msg.pinned === true);
      setPinnedMessage(pinned || null);
    });
    return () => unsubscribe();
  }, [chatId]);

  // Mark all messages sent by the partner as read when current user opens chat
  React.useEffect(() => {
    const markMessagesAsRead = async () => {
      try {
        for (const msg of messages) {
          if (msg.senderId !== auth.currentUser.uid && !msg.read) {
            const msgDocRef = doc(db, "chats", chatId, "messages", msg.id);
            await setDoc(msgDocRef, { read: true }, { merge: true });
          }
        }
      } catch (error) {
        console.error("Error marking partner messages as read:", error);
      }
    };
    markMessagesAsRead();
  }, [messages]);

  // PanResponder factory for each message with animated translation
  function createPanResponder(msg, translateX) {
    // Add animated opacity for delete animation
    if (!messageRefs.current[`${msg.id}_opacity`]) {
      messageRefs.current[`${msg.id}_opacity`] = new Animated.Value(1);
    }
    const opacity = messageRefs.current[`${msg.id}_opacity`];
    return PanResponder.create({
      // Only respond to horizontal swipes, not vertical touches
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only capture clear horizontal swipes
        return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Left swipe for reply
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
          setDraggingMessageId(msg.id);
        }
        // Right swipe for delete
        else if (gestureState.dx > 0) {
          translateX.setValue(gestureState.dx);
          setDraggingMessageId(msg.id);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Left swipe: reply
        if (gestureState.dx < -30) {
          setReplyTo(msg);
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setDraggingMessageId(null));
        }
        // Right swipe: delete
        else if (gestureState.dx > 30) {
          // Animate opacity to 0 and translateX a bit further right, then delete
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: 60,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(async () => {
            try {
              // Remove from Firestore
              const { deleteDoc, doc: firestoreDoc } = await import(
                "firebase/firestore"
              );
              await deleteDoc(
                firestoreDoc(db, "chats", chatId, "messages", msg.id)
              );
            } catch (e) {
              console.error("Error deleting message:", e);
            }
            // Optionally reset values for reuse
            opacity.setValue(1);
            translateX.setValue(0);
            setDraggingMessageId(null);
          });
        }
        // Otherwise, reset
        else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setDraggingMessageId(null));
        }
      },
      // Allow pan responder to work even when keyboard is open
      keyboardShouldPersistTaps: "always",
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#101115ff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={-30}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: "#181a20",
          borderBottomWidth: 1,
          borderBottomColor: "#2c2f38ff",
          paddingTop: 80,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-outline" size={26} color="#fff" />
        </TouchableOpacity>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Profile", {
                user: { ...partner, id: partner.uid },
              })
            }
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 18,
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {partner.name}
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 13,
              color: "#bdbdbd",
              marginTop: 2,
              textAlign: "center",
            }}
          >
            {partner.lastSeen
              ? `last seen ${new Date(partner.lastSeen).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`
              : "last seen recently"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("Profile", {
              user: { ...partner, id: partner.uid },
            })
          }
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: partner.avatarBgColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
              {partner.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Pinned Message */}
      {pinnedMessage && (
        <View
          style={{
            backgroundColor: "#2c2f38",
            marginTop: 0,
            marginBottom: 0,
            padding: 12,
            borderLeftWidth: 3,
            borderLeftColor: "#58618bff",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Ionicons
            name="pin"
            size={16}
            color="#FFD700"
            style={{ marginRight: 8 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: "500",
                marginBottom: 2,
              }}
            >
              Pinned message
            </Text>
            <Text
              style={{
                color: "#bdbdbd",
                fontSize: 13,
              }}
              numberOfLines={2}
            >
              {pinnedMessage.text}
            </Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              try {
                // Unpin the message
                const { updateDoc, doc: firestoreDoc } = await import(
                  "firebase/firestore"
                );
                await updateDoc(
                  firestoreDoc(
                    db,
                    "chats",
                    chatId,
                    "messages",
                    pinnedMessage.id
                  ),
                  { pinned: false }
                );
              } catch (error) {
                console.error("Error unpinning message:", error);
              }
            }}
            style={{
              padding: 4,
              marginLeft: 8,
            }}
          >
            <Ionicons name="close" size={16} color="#888" />
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={-30}
      >
        <ScrollView
          style={{ flex: 1, padding: 16 }}
          contentContainerStyle={{ paddingBottom: 10, bottom: 10 }}
          ref={scrollViewRef}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg) => {
            // Use persistent Animated.Value for each message
            if (!messageRefs.current[msg.id]) {
              messageRefs.current[msg.id] = new Animated.Value(0);
            }
            if (!messageRefs.current[`${msg.id}_opacity`]) {
              messageRefs.current[`${msg.id}_opacity`] = new Animated.Value(1);
            }
            const translateX = messageRefs.current[msg.id];
            const opacity = messageRefs.current[`${msg.id}_opacity`];
            const panResponder = createPanResponder(msg, translateX);

            // Interpolated opacities for swipe icons
            const replyOpacity = translateX.interpolate({
              inputRange: [-80, -30],
              outputRange: [1, 0],
              extrapolate: "clamp",
            });
            const deleteOpacity = translateX.interpolate({
              inputRange: [30, 80],
              outputRange: [0, 1],
              extrapolate: "clamp",
            });

            return (
              <View
                key={msg.id}
                style={{ position: "relative", marginVertical: 3 }}
              >
                {/* Reply icon (left) */}
                <Animated.View
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    justifyContent: "center",
                    alignItems: "center",
                    opacity: replyOpacity,
                    zIndex: 0,
                    width: 40,
                  }}
                  pointerEvents="none"
                >
                  <Ionicons name="arrow-undo-outline" size={24} color="#fff" />
                </Animated.View>

                {/* Delete icon (right) */}
                <Animated.View
                  style={{
                    position: "absolute",
                    right: 330,
                    top: 0,
                    bottom: 0,
                    justifyContent: "center",
                    alignItems: "center",
                    opacity: deleteOpacity,
                    zIndex: 0,
                    width: 40,
                  }}
                  pointerEvents="none"
                >
                  <Ionicons name="trash-outline" size={24} color="#fff" />
                </Animated.View>

                <TouchableOpacity
                  onLongPress={(event) => handleMessageLongPress(msg, event)}
                  delayLongPress={250}
                  activeOpacity={0.8}
                >
                  <Animated.View
                    {...panResponder.panHandlers}
                    style={{
                      transform: [{ translateX }],
                      opacity: opacity,
                      alignSelf:
                        msg.senderId === auth.currentUser.uid
                          ? "flex-end"
                          : "flex-start",
                      backgroundColor:
                        msg.senderId === auth.currentUser.uid
                          ? "#475073ff"
                          : "#2c2f38ff",
                      borderRadius: 20,
                      padding: 10,
                      paddingLeft: 14,
                      maxWidth: "85%",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      marginLeft:
                        msg.senderId === auth.currentUser.uid ? undefined : 0,
                      marginRight:
                        msg.senderId === auth.currentUser.uid ? 0 : undefined,
                      zIndex: 1,
                    }}
                  >
                    {/* Reply bubble preview (if this message is a reply) */}
                    {msg.replyTo && (
                      <View
                        style={{
                          backgroundColor: "#404252",
                          borderRadius: 12,
                          paddingVertical: 4,
                          paddingHorizontal: 10,
                          marginBottom: 4,
                          maxWidth: "95%",
                        }}
                      >
                        <Text
                          style={{
                            color: "#bdbdbd",
                            fontSize: 14,
                            fontStyle: "italic",
                          }}
                          numberOfLines={2}
                        >
                          {msg.replyTo.senderId === auth.currentUser.uid
                            ? "You"
                            : partner.name}
                          {": "}
                          {msg.replyTo.text}
                        </Text>
                      </View>
                    )}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        width: "100%",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 16,
                          marginRight: 6,
                          maxWidth: "80%",
                        }}
                      >
                        {msg.text}
                      </Text>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text
                          style={{
                            color: "#aaa",
                            fontSize: 12,
                            marginRight: 4,
                          }}
                        >
                          {msg.timestamp
                            ? new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })
                            : ""}
                        </Text>
                        {msg.senderId === auth.currentUser.uid && (
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 4,
                              bottom: -1,
                              backgroundColor: msg.read ? "#00ff88ff" : "red",
                            }}
                          />
                        )}
                      </View>
                    </View>
                  </Animated.View>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Message Input */}
      <View
        style={{
          flexDirection: "column",
          paddingHorizontal: 10,
          paddingVertical: 8,
          paddingBottom: 40,
          backgroundColor: "#181a20",
          borderTopWidth: 1,
          borderTopColor: "#2c2f38ff",
        }}
      >
        {/* Reply preview above input */}
        {replyTo && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#2c2f38",
              borderRadius: 12,
              marginBottom: 5,
              paddingVertical: 5,
              paddingHorizontal: 10,
              maxWidth: "95%",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "#bdbdbd",
                  fontSize: 14,
                  fontStyle: "italic",
                }}
                numberOfLines={2}
              >
                Replying to{" "}
                {replyTo.senderId === auth.currentUser.uid
                  ? "You"
                  : partner.name}
                {": "}
                {replyTo.text}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReplyTo(null)}
              style={{
                marginLeft: 10,
                backgroundColor: "#404252",
                borderRadius: 12,
                padding: 2,
                justifyContent: "center",
                alignItems: "center",
                width: 24,
                height: 24,
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
                ×
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Message"
            placeholderTextColor="#888"
            style={{
              flex: 1,
              backgroundColor: "#2c2f38ff",
              color: "#fff",
              borderRadius: 20,
              paddingHorizontal: 15,
              paddingVertical: 10,
              fontSize: 16,
              marginRight: 10,
            }}
            onFocus={() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }}
            keyboardShouldPersistTaps="handled"
          />
          <TouchableOpacity
            onPress={async () => {
              if (messageText.trim() === "") return;
              try {
                let msgObj = {
                  text: messageText,
                  senderId: auth.currentUser.uid,
                  timestamp: Date.now(),
                  read: false,
                };
                if (replyTo) {
                  msgObj.replyTo = {
                    text: replyTo.text,
                    senderId: replyTo.senderId,
                  };
                }
                await addDoc(
                  collection(db, "chats", chatId, "messages"),
                  msgObj
                );
                setMessageText("");
                setReplyTo(null);
                scrollViewRef.current?.scrollToEnd({ animated: true });
              } catch (error) {
                console.error("Error sending message:", error);
              }
            }}
            style={{
              backgroundColor: "#58618bff",
              borderRadius: 20,
              padding: 10,
            }}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Message Options Modal */}
      <Modal visible={messageOptionsVisible} transparent animationType="fade">
        <TouchableWithoutFeedback
          onPress={() => setMessageOptionsVisible(false)}
        >
          <View style={{ flex: 1 }}>
            {/* Blurred background */}
            <BlurView
              intensity={20}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />

            {/* Message pop-out effect - positioned above menu when menu is above message */}
            {selectedMessage && (
              <View
                style={{
                  position: "absolute",
                  left: selectedMessageLayout.x,
                  top:
                    selectedMessageLayout.y > 400
                      ? selectedMessageLayout.y - 250 // Show above menu when menu is above message
                      : selectedMessageLayout.y, // Show at original position when menu is below
                  backgroundColor:
                    selectedMessage.senderId === auth.currentUser.uid
                      ? "#475073ff"
                      : "#2c2f38ff",
                  borderRadius: 20,
                  padding: 10,
                  paddingLeft: 14,
                  paddingRight: 14,
                  maxWidth: "85%",
                  alignSelf: "flex-start",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                  transform: [{ scale: 1.05 }],
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 16,
                  }}
                >
                  {selectedMessage.text}
                </Text>
              </View>
            )}

            {/* Options menu positioned above or below the message based on screen position */}
            <View
              style={{
                position: "absolute",
                left: Math.max(10, selectedMessageLayout.x - 100),
                top:
                  selectedMessageLayout.y > 400
                    ? selectedMessageLayout.y - 200 // Show above if message is in lower half
                    : selectedMessageLayout.y +
                      selectedMessageLayout.height +
                      10, // Show below if in upper half
                backgroundColor: "#1e1f25ff",
                borderRadius: 20,
                padding: 16,
                width: 280,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              {/* Options */}
              {[
                {
                  icon: "bookmark-outline",
                  label: "Save",
                  onPress: handleSaveMessage,
                },
                {
                  icon: "trash-outline",
                  label: "Delete",
                  onPress: handleDeleteMessage,
                },
                {
                  icon: "arrow-undo-outline",
                  label: "Reply",
                  onPress: handleReplyToMessage,
                },
                {
                  icon: "arrow-forward-outline",
                  label: "Forward",
                  onPress: handleForwardMessage,
                },
                {
                  icon: "copy-outline",
                  label: "Copy",
                  onPress: handleCopyMessage,
                },
                {
                  icon: "pin-outline",
                  label: "Pin",
                  onPress: handlePinMessage,
                },
              ].map((option, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={option.onPress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    marginBottom: 8,
                    backgroundColor: "#2c2f38",
                  }}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color="#fff"
                    style={{ marginRight: 12 }}
                  />
                  <Text style={{ color: "#fff", fontSize: 16 }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Accept email, name, nickname, avatar, avatarBgColor as props, or extract from route.params
function SettingsScreen({
  navigation,
  route,
  email: propEmail,
  name: propName,
  nickname: propNickname,
  avatar,
  avatarBgColor,
  openModal,
  updateUserInfo, // <-- for updating parent user info
}) {
  // Try to get values from props first, then from route.params, then fallback defaults
  const name =
    propName || (route && route.params && route.params.name) || "User Name";
  const email =
    propEmail ||
    (route && route.params && route.params.email) ||
    "user@email.com";
  const nickname =
    propNickname ||
    (route && route.params && route.params.nickname) ||
    "userhandle";
  const [selectedTab, setSelectedTab] = useState("Profile");
  const [aboutVisible, setAboutVisible] = useState(false);
  // Modal state for editing user info
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editNickname, setEditNickname] = useState(nickname);
  const [editAvatarColor, setEditAvatarColor] = useState(avatarBgColor);
  const tabColors = {
    Profile: "#4d596fff",
    Privacy: "#334e81ff",
    Notifications: "#75276dff",
    Appearance: "#5300c1ff",
    About: "#454952ff",
    "Saved Messages": "#1f6c2eff",
    "Log Out": "#aa5c5c",
  };
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const iconMapping = {
    Profile: "person",
    Privacy: "lock-closed",
    Notifications: "notifications",
    Appearance: "color-palette",
    About: "information-circle",
    "Saved Messages": "bookmark",
    "Log Out": "log-out",
  };

  useFocusEffect(
    React.useCallback(() => {
      opacity.setValue(0);
      scale.setValue(0.95);
      headerOpacity.setValue(0);
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
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }, [opacity, scale, headerOpacity])
  );

  // Keep edit fields in sync with props when modal opens
  React.useEffect(() => {
    if (editVisible) {
      setEditName(name);
      setEditNickname(nickname);
      setEditAvatarColor(avatarBgColor);
    }
    // eslint-disable-next-line
  }, [editVisible]);

  // Dynamically set the header using navigation.setOptions whenever name, nickname, or email changes
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => {
        const headerOpacity = new Animated.Value(1);
        return (
          <Animated.View
            style={{
              backgroundColor: "#181a20",
              paddingHorizontal: 0,
              paddingTop: 10,
              paddingBottom: 8,
              width: 360,
              marginLeft: 5,
              marginTop: -20,
              height: 140,
              opacity: headerOpacity,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <TouchableOpacity onPress={openModal}>
                <Ionicons name="qr-code-outline" size={28} color="#adadadff" />
              </TouchableOpacity>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>
                Settings
              </Text>
              <TouchableOpacity onPress={() => setEditVisible(true)}>
                <Text style={{ color: "#adadadff", fontSize: 18 }}>Edit</Text>
              </TouchableOpacity>
            </View>
            {/* Avatar and name section wrapped in TouchableOpacity for navigation to own profile */}
            <TouchableOpacity
              style={{ alignItems: "center" }}
              onPress={() =>
                navigation.navigate("Profile", {
                  user: {
                    uid: auth.currentUser.uid,
                    name,
                    nickname,
                    avatarBgColor,
                    avatar,
                  },
                })
              }
            >
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 100,
                  backgroundColor: avatarBgColor || "#2a2f37ff",
                  alignSelf: "center",
                  marginTop: 10,
                  overflow: "hidden",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {!avatar ? (
                  <Text
                    style={{ color: "#fff", fontSize: 36, fontWeight: "bold" }}
                  >
                    {name ? name.charAt(0).toUpperCase() : "U"}
                  </Text>
                ) : (
                  <Image
                    source={{ uri: avatar }}
                    style={{ width: 100, height: 100 }}
                  />
                )}
              </View>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 24,
                  fontWeight: "bold",
                  marginTop: 12,
                  textAlign: "center",
                  alignSelf: "center",
                }}
              >
                {name}
              </Text>
              <Text
                style={{
                  color: "#7c8598ff",
                  fontSize: 17,
                  marginTop: 5,
                  textAlign: "center",
                  alignSelf: "center",
                }}
              >
                @{nickname}
                {email ? ` • ${email}` : ""}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        );
      },
    });
  }, [navigation, name, nickname, email, avatar, avatarBgColor, openModal]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ scale }],
          paddingTop: 30,
        },
      ]}
    >
      <View
        style={{
          flexDirection: "column",
          alignItems: "flex-start",
          width: "100%",
          paddingVertical: 0,
          paddingHorizontal: 24,
        }}
      >
        {[
          "Profile",
          "Saved Messages",
          "Privacy",
          "Notifications",
          "Appearance",
          "About",
          "Log Out",
        ].map((tab, idx, arr) => (
          <TouchableOpacity
            key={tab}
            onPress={() => {
              if (tab === "About") {
                setAboutVisible(true);
              } else if (tab === "Log Out") {
                navigation.replace("Login");
              } else if (tab === "Profile") {
                navigation.navigate("Profile", {
                  user: {
                    name,
                    nickname,
                    avatarBgColor,
                    email,
                  },
                });
              } else {
                setSelectedTab(tab);
              }
            }}
            style={{
              backgroundColor: "#1c1d23ff",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 10,
              marginBottom: 8,
              width: "100%",
            }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: tabColors[tab],
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Ionicons name={iconMapping[tab]} size={20} color="#c6c6c6ff" />
              </View>
              <Text
                style={{
                  color: "#adadad",
                  fontWeight: "normal",
                  fontSize: 17,
                  letterSpacing: 0.5,
                }}
              >
                {tab}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      {/* About Modal */}
      <Modal visible={aboutVisible} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 280,
              height: 330,
              backgroundColor: "#1e1f25ff",
              borderRadius: 30,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 18,
                textAlign: "center",
                fontWeight: "bold",
                marginTop: 50,
                marginBottom: 10,
              }}
            >
              About FL Messenger
            </Text>
            <Text
              style={{
                color: "#bdbdbdff",
                fontSize: 18,
                textAlign: "center",
                marginBottom: 50,
              }}
            >
              Version 1.0
            </Text>
            <Text
              style={{
                color: "#fff",
                fontSize: 18,
                textAlign: "center",
                width: 250,
                marginBottom: 65,
              }}
            >
              Messenger is developed by
              <TouchableOpacity
                onPress={() => Linking.openURL("https://github.com/1andgraf")}
              >
                <Text
                  style={{
                    color: "#3a89ffff",
                    textAlign: "center",
                    fontSize: 17,
                    fontWeight: "bold",
                    marginTop: 3,
                  }}
                >
                  https://github.com/1andgraf
                </Text>
              </TouchableOpacity>
            </Text>
            <TouchableOpacity
              onPress={() => setAboutVisible(false)}
              style={{
                paddingHorizontal: 100,
                paddingVertical: 15,
                backgroundColor: "#3a3e5bff",
                borderRadius: 15,
                alignSelf: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Edit Profile Modal */}
      <Modal visible={editVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setEditVisible(false)}>
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <TouchableWithoutFeedback>
              <View
                style={{
                  width: 300,
                  padding: 20,
                  backgroundColor: "#1e1f25ff",
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: "bold",
                    alignSelf: "center",
                    marginVertical: 5,
                    marginBottom: 10,
                  }}
                >
                  Edit Profile
                </Text>
                <TextInput
                  placeholder="Name"
                  placeholderTextColor="#888"
                  style={{
                    backgroundColor: "#2c2f38ff",
                    color: "#fff",
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    borderRadius: 10,
                    marginTop: 12,
                  }}
                  value={editName}
                  onChangeText={setEditName}
                />
                <TextInput
                  placeholder="Nickname"
                  placeholderTextColor="#888"
                  style={{
                    backgroundColor: "#2c2f38ff",
                    color: "#fff",
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    borderRadius: 10,
                    marginTop: 12,
                  }}
                  value={editNickname}
                  onChangeText={setEditNickname}
                />
                <Text style={{ color: "#fff", marginTop: 12 }}>
                  Avatar Color
                </Text>
                <View style={{ flexDirection: "row", marginTop: 8 }}>
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
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 20,
                        backgroundColor: color,
                        marginRight: 10,
                        borderWidth: editAvatarColor === color ? 2 : 0,
                        borderColor: "#fff",
                      }}
                      onPress={() => setEditAvatarColor(color)}
                    />
                  ))}
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const db = getFirestore();
                      const user = auth.currentUser;
                      if (user) {
                        // Update Firestore
                        await setDoc(
                          doc(db, "users", user.uid),
                          {
                            name: editName,
                            nickname: editNickname,
                            avatarBgColor: editAvatarColor,
                          },
                          { merge: true }
                        );

                        // Update MainApp state immediately
                        if (updateUserInfo) {
                          updateUserInfo({
                            name: editName,
                            nickname: editNickname,
                            avatarBgColor: editAvatarColor,
                          });
                        }
                      }
                      setEditVisible(false);
                    } catch (error) {
                      console.error("Error updating user info:", error);
                    }
                  }}
                  style={{
                    marginTop: 20,
                    paddingVertical: 10,
                    backgroundColor: "#58618bff",
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 16 }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditVisible(false)}
                  style={{
                    marginTop: 10,
                    paddingVertical: 10,
                    backgroundColor: "#3a3e5bff",
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 16 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Animated.View>
  );
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainApp({ userInfo: initialUserInfo, setUserInfo }) {
  const [qrVisible, setQrVisible] = useState(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;

  // Use local userInfo if setUserInfo is not provided (for fallback/testing)
  const [localUserInfo, setLocalUserInfo] = useState(
    initialUserInfo || {
      name: "",
      nickname: "",
      email: "",
      avatar: "",
      avatarBgColor: "#2c2f37",
    }
  );
  // Choose which userInfo and setter to use
  const userInfo = setUserInfo ? initialUserInfo : localUserInfo;
  const updateUserInfo = setUserInfo
    ? (data) => {
        setUserInfo((prev) => ({ ...prev, ...data }));
      }
    : (data) => {
        setLocalUserInfo((prev) => ({ ...prev, ...data }));
      };

  React.useEffect(() => {
    const db = getFirestore();
    const updateLastSeen = async () => {
      const user = auth.currentUser;
      if (user) {
        await setDoc(
          doc(db, "users", user.uid),
          { lastSeen: Date.now() },
          { merge: true }
        );
      }
    };

    // Run when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        updateLastSeen();
      }
    });

    // Update immediately when mounted
    updateLastSeen();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleUpdateUserInfo = (data) => {
    if (setUserInfo) {
      setUserInfo((prev) => ({ ...prev, ...data }));
    } else {
      setLocalUserInfo((prev) => ({ ...prev, ...data }));
      console.warn("setUserInfo prop is undefined. Cannot update user info.");
    }
  };

  const openModal = () => {
    setQrVisible(true);
    modalOpacity.setValue(0);
    Animated.timing(modalOpacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(modalOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setQrVisible(false);
    });
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: styles.header,
          headerTintColor: "#fff",
          headerTitleAlign: "center",
          headerTitleContainerStyle: { marginBottom: 80 },
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: "#6457a0ff",
          tabBarInactiveTintColor: "#888",
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, focused }) => {
            if (route.name === "Chats") {
              return (
                <Ionicons
                  name="chatbubble"
                  size={32}
                  color={color}
                  style={{ marginTop: 17, height: 40 }}
                />
              );
            } else if (route.name === "Settings") {
              const isFocused = focused;
              return (
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: userInfo.avatarBgColor || "#2c2f37",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: 10,
                    borderWidth: isFocused ? 2 : 0,
                    borderColor: isFocused ? "#6457a0ff" : "transparent",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    {userInfo.name
                      ? userInfo.name.charAt(0).toUpperCase()
                      : "U"}
                  </Text>
                </View>
              );
            }
          },
        })}
      >
        <Tab.Screen
          name="Chats"
          component={ChatsScreen}
          options={({ route, navigation }) => ({
            headerTitle: () => {
              // Revert: keep search bar only in header, not in main body
              // Provide search bar handlers from route.params
              const headerOpacity =
                route.params && route.params.headerOpacity
                  ? route.params.headerOpacity
                  : new Animated.Value(1);
              const onSearchFocus =
                route.params && route.params.onSearchFocus
                  ? route.params.onSearchFocus
                  : () => {};
              const onSearchBlur =
                route.params && route.params.onSearchBlur
                  ? route.params.onSearchBlur
                  : () => {};
              const onSearchTextChange =
                route.params && route.params.onSearchTextChange
                  ? route.params.onSearchTextChange
                  : () => {};
              const searchText =
                route.params && typeof route.params.searchText === "string"
                  ? route.params.searchText
                  : "";
              // Get searchInputRef from params, fallback to React.createRef()
              const searchInputRef =
                route.params && route.params.searchInputRef
                  ? route.params.searchInputRef
                  : React.createRef();
              return (
                <Animated.View
                  style={{
                    backgroundColor: "#181a20",
                    paddingHorizontal: 0,
                    paddingTop: 10,
                    paddingBottom: 8,
                    width: 360,
                    marginLeft: 5,
                    marginTop: 70,
                    height: 90,
                    opacity: headerOpacity,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 18,
                        fontWeight: "bold",
                        marginLeft: "153",
                      }}
                    >
                      Chats
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (route.params && route.params.onSearchFocus) {
                          route.params.onSearchFocus();
                          setTimeout(() => {
                            route.params.searchInputRef.current?.focus();
                          }, 50);
                        }
                      }}
                    >
                      <Ionicons name="create-outline" size={28} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#2c2f38ff",
                      borderRadius: 10,
                    }}
                  >
                    <Ionicons
                      name="search-outline"
                      size={20}
                      color="#aaa"
                      style={{ marginLeft: 10 }}
                    />
                    <TextInput
                      ref={searchInputRef}
                      placeholder="Search"
                      placeholderTextColor="#aaa"
                      style={{
                        flex: 1,
                        backgroundColor: "transparent",
                        borderRadius: 10,
                        paddingVertical: 10,
                        color: "#fff",
                        fontSize: 16,
                        marginLeft: 10,
                      }}
                      value={searchText}
                      onFocus={() => {
                        onSearchFocus();
                        // Open keyboard manually
                        setTimeout(() => {
                          searchInputRef.current?.focus();
                        }, 50);
                      }}
                      onBlur={onSearchBlur}
                      onChangeText={onSearchTextChange}
                    />
                  </View>
                </Animated.View>
              );
            },
            headerStyle: {
              backgroundColor: "#181a20",
              borderBottomWidth: 2,
              shadowColor: "transparent",
              elevation: 0,
              height: 175,
            },
            headerTitleAlign: "left",
          })}
        />
        <Tab.Screen
          name="Settings"
          children={(props) => (
            <SettingsScreen
              {...props}
              name={userInfo.name}
              nickname={userInfo.nickname}
              email={userInfo.email}
              avatar={userInfo.avatar}
              avatarBgColor={userInfo.avatarBgColor}
              openModal={openModal}
              updateUserInfo={handleUpdateUserInfo}
            />
          )}
          options={{
            headerStyle: {
              backgroundColor: "#181a20",
              borderBottomWidth: 2,
              shadowColor: "transparent",
              elevation: 0,
              height: 320,
            },
            headerTitleAlign: "left",
            headerTintColor: "#fff",
          }}
        />
      </Tab.Navigator>
      <Modal visible={qrVisible} transparent animationType="fade">
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            alignItems: "center",
            opacity: modalOpacity,
          }}
        >
          <View
            style={{
              width: 270,
              height: 360,
              backgroundColor: "#1e1f25ff",
              borderRadius: 30,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 230,
                height: 260,
                backgroundColor: "#2c2f38ff",
                borderRadius: 20,
                marginBottom: 15,
                alignItems: "center",
                paddingTop: 25,
              }}
            >
              <View style={styles.qrPopupSquare}>
                {userInfo?.nickname ? (
                  <QRCode
                    value={userInfo.nickname}
                    size={180}
                    color="white"
                    backgroundColor="#2c2f38ff"
                  />
                ) : (
                  <Text style={{ color: "white" }}>No QR data</Text>
                )}
              </View>
              <Text
                style={{
                  color: "white",
                  marginTop: 18,
                  fontWeight: "bold",
                  fontSize: 17,
                }}
              >
                @{userInfo.nickname}
              </Text>
            </View>
            <TouchableOpacity
              onPress={closeModal}
              style={{
                paddingHorizontal: 95,
                paddingVertical: 15,
                backgroundColor: "#3a3e5bff",
                borderRadius: 15,
                alignSelf: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

export default function App() {
  const [userInfo, setUserInfo] = useState({
    name: "",
    nickname: "",
    email: "",
    avatarBgColor: "#2c2f37",
  });

  const handleLogin = (userData) => {
    if (!userData) return;
    setUserInfo({
      name: userData.name || "",
      nickname: userData.nickname || "",
      email: userData.email || "",
      avatarBgColor: userData.avatarBgColor || "#2c2f37",
    });
  };

  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login">
          {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
        </Stack.Screen>
        <Stack.Screen name="MainApp">
          {(props) => (
            <MainApp {...props} userInfo={userInfo} setUserInfo={setUserInfo} />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="ChatView"
          component={ChatViewScreen}
          options={{
            headerShown: false,
            headerStyle: { backgroundColor: "#181a20" },
            headerTintColor: "#fff",
          }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
