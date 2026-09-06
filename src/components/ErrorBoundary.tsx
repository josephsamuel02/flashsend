// src/components/ErrorBoundary.tsx
// React Error Boundary for catching and displaying errors gracefully

import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

class ErrorBoundaryInner extends Component<Props & { C: ThemeColors; styles: ReturnType<typeof getStyles> }, State> {
  constructor(props: Props & { C: ThemeColors; styles: ReturnType<typeof getStyles> }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo: errorInfo?.componentStack || null,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { C, styles } = this.props;
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="error-outline" size={64} color={C.error} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error. This has been logged.
          </Text>
          
          {__DEV__ && this.state.error && (
            <ScrollView style={styles.errorDetails}>
              <Text style={styles.errorTitle}>Error Details (Dev Mode):</Text>
              <Text style={styles.errorText}>{this.state.error.toString()}</Text>
              {this.state.errorInfo && (
                <Text style={styles.errorStack}>{this.state.errorInfo}</Text>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <MaterialIcons name="refresh" size={20} color="white" />
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            If the problem persists, try restarting the app or reinstalling.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: C.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
    maxWidth: 320,
  },
  errorDetails: {
    width: '100%',
    maxHeight: 200,
    backgroundColor: C.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  errorTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: C.error,
    marginBottom: Spacing.xs,
  },
  errorText: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: C.textSecondary,
    marginBottom: Spacing.sm,
  },
  errorStack: {
    fontSize: 10,
    fontFamily: 'Courier',
    color: C.textMuted,
    lineHeight: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    elevation: 2,
  },
  buttonText: {
    color: 'white',
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
  },
  hint: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
    maxWidth: 280,
  },
});

export default function ErrorBoundary(props: Props) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  return <ErrorBoundaryInner {...props} C={C} styles={styles} />;
}
