package expo.modules.sendappnative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SendappNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SendappNative")

    Function("getAppApkPath") {
      val context = appContext.reactContext
      context?.packageCodePath
    }
  }
}
