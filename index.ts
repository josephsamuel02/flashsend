import 'expo-dev-client';
import { Buffer } from 'buffer';
// Polyfill Buffer for react-native-tcp-socket and server networking (Hermes has no Node Buffer)
if (!(global as any).Buffer) {
  (global as any).Buffer = Buffer;
}
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
