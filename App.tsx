import { Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

export default function App() {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <Button title="Open sheet" onPress={() => setOpen(true)} />
      {open ? (
        <Host style={styles.host}>
          <ModalBottomSheet onDismissRequest={() => setOpen(false)} skipPartiallyExpanded>
            {/* No `matchContents`: Compose sizes the host and reports the size to Yoga. */}
            <RNHostView>
              <View
                style={styles.content}
                onLayout={(event) => console.log(`[repro] RN content height ${event.nativeEvent.layout.height}`)}
              >
                <TextInput style={styles.input} placeholder="Tap here, then swipe back from the screen edge" />
                <View style={styles.fill}>
                  <Text style={styles.label}>This block should always reach the keyboard / the bottom of the sheet</Text>
                </View>
              </View>
            </RNHostView>
          </ModalBottomSheet>
        </Host>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  host: { width: 0, height: 0 },
  content: { flex: 1, padding: 16, gap: 16 },
  input: { borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 12, fontSize: 16 },
  fill: { flex: 1, backgroundColor: 'tomato', borderRadius: 8, justifyContent: 'flex-end', padding: 12 },
  label: { color: 'white', fontSize: 16 },
});
