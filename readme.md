# Kinde Expo SDK

The Kinde Expo SDK allows developers to quickly and securely integrate a new or an existing Expo application into the Kinde platform.

You can also use the [Expo starter kit](https://github.com/kinde-starter-kits/expo-starter-kit) to get started.

## **Installation**

```bash
npx nypm add @kinde/expo
```

## **Environment variables**

The redirection URL is automatically computed using Expo Auth Session `makeRedirectUri` function. You can find more information about this function [here](https://docs.expo.dev/versions/latest/sdk/auth-session/#makeRedirectUri).

## Integrate with your app

Setup the Kinde Provider in your App.js file.

```typescript
import { KindeAuthProvider } from '@kinde/expo';

export default function App() {
  return (
    <KindeAuthProvider config={{
       domain: "https://your-app.kinde.com", // Required
       clientId: "your-client-id", // Required
       // Optional (default: "openid profile email offline")
       scopes: "openid profile email offline",
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

## Using Utility Functions

All utility functions from `@kinde/js-utils` are available through `@kinde/expo/utils` and also through the `useKindeAuth` hook. This allows you to use these utilities directly in your Expo application.

```tsx
import { getUserProfile, getFlag, getRoles } from "@kinde/expo/utils";

// Example usage
const checkUserProfile = async () => {
  const profile = await getUserProfile();
  console.log("User profile:", profile);
};
```

Common utility functions include:

- `getUserProfile` - Get the current user's profile
- `getFlag` - Check feature flag values
- `getRoles` - Get the current user's roles
- `getCurrentOrganization` - Get the current organization
- `getUserOrganizations` - Get all organizations the user belongs to
- `getPermission` - get a single permission value
- `getPermissions` - get all user permissions
- `getClaim` - Get a specific claim from the token
- `getClaims` - Get all claims from the token
- `refreshToken` - Manually refresh the access token

## Contributing

If you'd like to contribute to this project, please follow these steps:

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Submit a pull request.

## License

By contributing to Kinde, you agree that your contributions will be licensed under its MIT License.
