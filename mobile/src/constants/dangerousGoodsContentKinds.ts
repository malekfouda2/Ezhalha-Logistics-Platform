import { DgContentKind, DgContentKindValue } from "@shared/dangerous-goods";
import { ContentKindIconName } from "@/components/sections/createShipment/dangerousGoods/ContentKindCard";

// The 14 content kinds a client may pick from. Three DgContentKind values exist purely for
// carrier code resolution (EXCEPTED_QUANTITIES_IATA, ADR_LOAD_EXEMPTION, DRY_ICE_UN1845) and
// are deliberately not offered here — same set the web client shows in create-shipment.tsx.
export interface DangerousGoodsContentKindOption {
  value: DgContentKindValue;
  icon: ContentKindIconName;
}

export const DANGEROUS_GOODS_CONTENT_KINDS: DangerousGoodsContentKindOption[] = [
  { value: DgContentKind.FULLY_REGULATED, icon: "flask" },
  { value: DgContentKind.LITHIUM_ION_PI967_SECTION_II, icon: "battery-charging" },
  { value: DgContentKind.LITHIUM_ION_PI966_SECTION_II, icon: "battery" },
  { value: DgContentKind.LITHIUM_ION_PI965_SECTION_II, icon: "zap" },
  { value: DgContentKind.LITHIUM_METAL_PI970_SECTION_II, icon: "battery-charging" },
  { value: DgContentKind.LITHIUM_METAL_PI969_SECTION_II, icon: "battery" },
  { value: DgContentKind.LIMITED_QUANTITIES_ADR, icon: "package" },
  { value: DgContentKind.CONSUMER_COMMODITY_ID8000, icon: "wind" },
  { value: DgContentKind.BIOLOGICAL_SUBSTANCE_UN3373, icon: "biohazard" },
  { value: DgContentKind.EXEMPT_SPECIMENS, icon: "test-tube" },
  { value: DgContentKind.MAGNETIZED_MATERIAL_UN2807, icon: "magnet" },
  { value: DgContentKind.PRESSURIZED_ARTICLES_UN3164, icon: "cylinder" },
  { value: DgContentKind.LITHIUM_FULLY_REGULATED, icon: "shield-alert-outline" },
  { value: DgContentKind.GENETICALLY_MODIFIED_ORGANISMS, icon: "biohazard" },
];
