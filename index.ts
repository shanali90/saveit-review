import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

import App from './App';

// Priority 7: Lightweight global error boundary
const defaultErrorHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  // In a real launch, this would be sent to Sentry.
  // For now, intercept the error and safely log it to prevent silent failures.
  console.error('Global Error Boundary caught:', error);
  if (defaultErrorHandler) {
    defaultErrorHandler(error, isFatal);
  }
});

registerRootComponent(App);
