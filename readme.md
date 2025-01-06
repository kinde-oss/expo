# Kinde Expo SDK

The Kinde Expo SDK allows developers to quickly and securely integrate a new or an existing Expo application into the Kinde platform.

## **Installation**

```bash
npm i @kinde/expo
yarn add @kinde/expo
pnpm add @kinde/expo
```

## **Environment variables**

The redirection URL is automatically computed using Expo Auth Session `makeRedirectUri` function. You can find more information about this function [here](https://docs.expo.dev/versions/latest/sdk/auth-session/#makeRedirectUri).

## Integrate with your app

Setup the Kinde Provider in your App.js file.

```typescript
import { Platform } from "react-native";
import { KindeAuthProvider } from '@kinde/expo';

export default function App() {
  return (
    <KindeAuthProvider config={{
       domain: "your-app.kinde.com", // Required
       clientId: "your-client-id", // Required
       // Optional (default: "openid profile email offline")
       scopes: "openid profile email offline",
       // Optional (default: "native")
       platform: Platform.OS !== "web" ? "native" : "web"
     }}>
      <!-- Your application code -->
    </KindeAuthProvider>
  );
}
```

## Authentication Methods

Simple and flexible functions for register, login and logout are part of the `useKindeAuth` hook

```tsx
import { useKindeAuth } from "@kinde/expo";
import { Pressable, View, Text } from "react-native";

export default function Authentication() {
  const kinde = useKindeAuth();

  const handleSignUp = async () => {
    const token = await kinde.register({});
    if (token) {
      // User was authenticated
    }
  };

  const handleSignIn = async () => {
    const token = await kinde.login({});
    if (token) {
      // User was authenticated
    }
  };

  const handleLogout = async () => {
    await kinde.logout({ revokeToken: true });
  };

  return !kinde.isAuthenticated ? (
    <View>
      <Pressable onPress={handleSignIn}>
        <Text>Sign In</Text>
      </Pressable>
      <Pressable onPress={handleSignUp}>
        <Text>Sign Up</Text>
      </Pressable>
    </View>
  ) : (
    <Pressable onPress={handleLogout}>
      <Text>Logout</Text>
    </Pressable>
  );
}
```

## Contributing

If you'd like to contribute to this project, please follow these steps:

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Submit a pull request.

## License

By contributing to Kinde, you agree that your contributions will be licensed under its MIT License.
