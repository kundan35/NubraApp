#pragma once

#include <jsi/jsi.h>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace nubra {

struct RawTick {
  std::string symbol;
  double  ltp       = 0.0;
  double  open      = 0.0;
  double  high      = 0.0;
  double  low       = 0.0;
  double  volume    = 0.0;
  double  oi        = 0.0;
  int64_t timestamp = 0;
  double  bid       = 0.0;
  double  ask       = 0.0;
  double  change    = 0.0;
  double  changePct = 0.0;
};

// Thread-safe tick store exposed to JS as global.nubraTickStore.
//
// Write path: OkHttp thread → JNI → writeTick()  (mutex-protected)
// Read path:  JS thread → JSI → drainDirty()     (mutex-protected swap)
//
// drainDirty() returns only symbols that changed since the last call.
// Called at 60fps via requestAnimationFrame — zero bridge, zero serialization.
class TickStore : public facebook::jsi::HostObject {
 public:
  // Process-wide singleton — created once, never deleted.
  static TickStore& shared();

  // Called from JNI (OkHttp callback thread) — thread-safe.
  void writeTick(const RawTick& tick);

  // JSI HostObject interface — JS thread only.
  facebook::jsi::Value get(
      facebook::jsi::Runtime& rt,
      const facebook::jsi::PropNameID& name) override;

  std::vector<facebook::jsi::PropNameID> getPropertyNames(
      facebook::jsi::Runtime& rt) override;

 private:
  TickStore() = default;

  std::mutex mutex_;
  std::unordered_map<std::string, RawTick> store_;
  std::vector<std::string> dirty_; // symbols pending delivery to JS

  facebook::jsi::Value drainDirty(facebook::jsi::Runtime& rt);
  facebook::jsi::Value getLatest(
      facebook::jsi::Runtime& rt, const std::string& symbol);
  facebook::jsi::Object tickToObject(
      facebook::jsi::Runtime& rt, const RawTick& tick) const;
};

} // namespace nubra
