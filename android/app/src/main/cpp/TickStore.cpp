#include "TickStore.h"
#include <unordered_set>

namespace nubra {

TickStore& TickStore::shared() {
  static TickStore instance;
  return instance;
}

// ── Write (OkHttp thread) ──────────────────────────────────────────────────

void TickStore::writeTick(const RawTick& tick) {
  std::lock_guard<std::mutex> guard(mutex_);
  store_[tick.symbol] = tick;
  dirty_.push_back(tick.symbol);
}

// ── JSI HostObject ─────────────────────────────────────────────────────────

facebook::jsi::Value TickStore::get(
    facebook::jsi::Runtime& rt,
    const facebook::jsi::PropNameID& name)
{
  const std::string key = name.utf8(rt);

  if (key == "drainDirty") {
    return facebook::jsi::Function::createFromHostFunction(
        rt,
        facebook::jsi::PropNameID::forAscii(rt, "drainDirty"),
        0,
        [this](facebook::jsi::Runtime& rt,
               const facebook::jsi::Value&,
               const facebook::jsi::Value*,
               size_t) -> facebook::jsi::Value {
          return drainDirty(rt);
        });
  }

  if (key == "getLatest") {
    return facebook::jsi::Function::createFromHostFunction(
        rt,
        facebook::jsi::PropNameID::forAscii(rt, "getLatest"),
        1,
        [this](facebook::jsi::Runtime& rt,
               const facebook::jsi::Value&,
               const facebook::jsi::Value* args,
               size_t count) -> facebook::jsi::Value {
          if (count < 1 || !args[0].isString()) {
            return facebook::jsi::Value::null();
          }
          return getLatest(rt, args[0].getString(rt).utf8(rt));
        });
  }

  return facebook::jsi::Value::undefined();
}

std::vector<facebook::jsi::PropNameID> TickStore::getPropertyNames(
    facebook::jsi::Runtime& rt)
{
  std::vector<facebook::jsi::PropNameID> props;
  props.push_back(facebook::jsi::PropNameID::forAscii(rt, "drainDirty"));
  props.push_back(facebook::jsi::PropNameID::forAscii(rt, "getLatest"));
  return props;
}

// ── drainDirty ─────────────────────────────────────────────────────────────
// Atomically swaps out the dirty list, deduplicates, returns JSI array.
// Fast path: if nothing changed, returns an empty array with zero allocations.

facebook::jsi::Value TickStore::drainDirty(facebook::jsi::Runtime& rt) {
  std::vector<std::string> localDirty;
  std::vector<RawTick>     ticks;

  {
    std::lock_guard<std::mutex> guard(mutex_);
    if (dirty_.empty()) {
      return facebook::jsi::Array(rt, 0); // fast path
    }
    std::swap(localDirty, dirty_);

    // Deduplicate — iterate in reverse so latest write wins per symbol
    std::unordered_set<std::string> seen;
    ticks.reserve(localDirty.size());
    for (auto it = localDirty.rbegin(); it != localDirty.rend(); ++it) {
      if (seen.insert(*it).second) {
        auto found = store_.find(*it);
        if (found != store_.end()) {
          ticks.push_back(found->second);
        }
      }
    }
  }

  auto result = facebook::jsi::Array(rt, ticks.size());
  for (size_t i = 0; i < ticks.size(); ++i) {
    result.setValueAtIndex(rt, i, tickToObject(rt, ticks[i]));
  }
  return result;
}

facebook::jsi::Value TickStore::getLatest(
    facebook::jsi::Runtime& rt, const std::string& symbol)
{
  std::lock_guard<std::mutex> guard(mutex_);
  auto it = store_.find(symbol);
  if (it == store_.end()) return facebook::jsi::Value::null();
  return tickToObject(rt, it->second);
}

facebook::jsi::Object TickStore::tickToObject(
    facebook::jsi::Runtime& rt, const RawTick& t) const
{
  using namespace facebook::jsi;
  auto o = Object(rt);
  o.setProperty(rt, "symbol",    String::createFromUtf8(rt, t.symbol));
  o.setProperty(rt, "ltp",       t.ltp);
  o.setProperty(rt, "open",      t.open);
  o.setProperty(rt, "high",      t.high);
  o.setProperty(rt, "low",       t.low);
  o.setProperty(rt, "volume",    t.volume);
  o.setProperty(rt, "oi",        t.oi);
  o.setProperty(rt, "timestamp", static_cast<double>(t.timestamp));
  o.setProperty(rt, "bid",       t.bid);
  o.setProperty(rt, "ask",       t.ask);
  o.setProperty(rt, "change",    t.change);
  o.setProperty(rt, "changePct", t.changePct);
  return o;
}

} // namespace nubra
