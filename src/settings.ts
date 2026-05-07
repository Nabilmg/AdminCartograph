/**
 * Strongly typed formatting settings for the visual.
 * Mirrors the objects defined in capabilities.json.
 */
import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsModel = formattingSettings.Model;

export type ViewMode = "auto" | "states" | "localities";
export type Position = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export type LegendSize = "small" | "medium" | "large";
export type LabelContent = "name" | "value" | "name_value";
export type LabelFormat = "auto" | "thousands" | "millions" | "percent";
export type Classification = "quantile" | "equal" | "manual";
export type ChoroplethMode = "automatic" | "custom";

class GeneralSettings extends FormattingSettingsCard {
  selectedCountry = new formattingSettings.TextInput({ name: "selectedCountry", displayName: "Country (ISO-3)", placeholder: "auto", value: "" });
  viewMode = new formattingSettings.ItemDropdown({
    name: "viewMode",
    displayName: "View mode",
    items: [
      { value: "auto", displayName: "Auto" },
      { value: "states", displayName: "Admin1" },
      { value: "localities", displayName: "Admin2" }
    ],
    value: { value: "auto", displayName: "Auto" }
  });
  interactionEnabled = new formattingSettings.ToggleSwitch({ name: "interactionEnabled", displayName: "Interaction enabled", value: true });
  hideUnfilteredStates = new formattingSettings.ToggleSwitch({ name: "hideUnfilteredStates", displayName: "Hide unfiltered Admin1 in Admin2 mode", value: false });
  background = new formattingSettings.ColorPicker({ name: "background", displayName: "Background color", value: { value: "#ffffff" } });
  transparentBackground = new formattingSettings.ToggleSwitch({ name: "transparentBackground", displayName: "Transparent background", value: false });

  name = "general";
  displayName = "Map";
  slices = [this.selectedCountry, this.viewMode, this.interactionEnabled, this.hideUnfilteredStates, this.background, this.transparentBackground];
}

class ChoroplethSettings extends FormattingSettingsCard {
  mode = new formattingSettings.ItemDropdown({
    name: "mode",
    displayName: "Color mode",
    items: [
      { value: "automatic", displayName: "Automatic ramp" },
      { value: "custom", displayName: "Custom classes" }
    ],
    value: { value: "automatic", displayName: "Automatic ramp" }
  });
  baseColor = new formattingSettings.ColorPicker({ name: "baseColor", displayName: "Base color", value: { value: "#1f77b4" } });
  classification = new formattingSettings.ItemDropdown({
    name: "classification",
    displayName: "Classification",
    items: [
      { value: "quantile", displayName: "Quantile" },
      { value: "equal", displayName: "Equal interval" },
      { value: "manual", displayName: "Manual breaks" }
    ],
    value: { value: "quantile", displayName: "Quantile" }
  });
  manualBreaks = new formattingSettings.TextInput({ name: "manualBreaks", displayName: "Manual breaks", placeholder: "10, 50, 100, 500", value: "" });
  classCount = new formattingSettings.NumUpDown({ name: "classCount", displayName: "Number of classes", value: 5 });
  color1 = new formattingSettings.ColorPicker({ name: "color1", displayName: "Class 1", value: { value: "#deebf7" } });
  color2 = new formattingSettings.ColorPicker({ name: "color2", displayName: "Class 2", value: { value: "#9ecae1" } });
  color3 = new formattingSettings.ColorPicker({ name: "color3", displayName: "Class 3", value: { value: "#4292c6" } });
  color4 = new formattingSettings.ColorPicker({ name: "color4", displayName: "Class 4", value: { value: "#2171b5" } });
  color5 = new formattingSettings.ColorPicker({ name: "color5", displayName: "Class 5", value: { value: "#084594" } });
  blankColor = new formattingSettings.ColorPicker({ name: "blankColor", displayName: "No-data color", value: { value: "#eeeeee" } });
  blankTransparent = new formattingSettings.ToggleSwitch({ name: "blankTransparent", displayName: "Transparent for no-data", value: false });
  fillOpacity = new formattingSettings.NumUpDown({ name: "fillOpacity", displayName: "Fill opacity", value: 0.85 });

  name = "choropleth";
  displayName = "Choropleth";
  slices = [this.mode, this.baseColor, this.classification, this.manualBreaks, this.classCount, this.color1, this.color2, this.color3, this.color4, this.color5, this.blankColor, this.blankTransparent, this.fillOpacity];
}

class BordersSettings extends FormattingSettingsCard {
  stateColor = new formattingSettings.ColorPicker({ name: "stateColor", displayName: "Admin1 border color", value: { value: "#444444" } });
  stateWidth = new formattingSettings.NumUpDown({ name: "stateWidth", displayName: "Admin1 border width", value: 1 });
  stateOpacity = new formattingSettings.NumUpDown({ name: "stateOpacity", displayName: "Admin1 border opacity", value: 1 });
  localityColor = new formattingSettings.ColorPicker({ name: "localityColor", displayName: "Admin2 border color", value: { value: "#888888" } });
  localityWidth = new formattingSettings.NumUpDown({ name: "localityWidth", displayName: "Admin2 border width", value: 0.5 });
  localityOpacity = new formattingSettings.NumUpDown({ name: "localityOpacity", displayName: "Admin2 border opacity", value: 0.8 });

  name = "borders";
  displayName = "Borders";
  slices = [this.stateColor, this.stateWidth, this.stateOpacity, this.localityColor, this.localityWidth, this.localityOpacity];
}

function makeLabelCard(cardName: string, cardDisplayName: string, defaults: Partial<{ show: boolean; content: LabelContent; fontSize: number; color: string; bold: boolean }> = {}) {
  return class LabelCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: defaults.show ?? true });
    content = new formattingSettings.ItemDropdown({
      name: "content",
      displayName: "Content",
      items: [
        { value: "name", displayName: "Name only" },
        { value: "value", displayName: "Value only" },
        { value: "name_value", displayName: "Name + value" }
      ],
      value: { value: defaults.content ?? "name", displayName: "Name only" }
    });
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font family", value: "Segoe UI" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font size", value: defaults.fontSize ?? 11 });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: defaults.color ?? "#222222" } });
    valueColor = new formattingSettings.ColorPicker({ name: "valueColor", displayName: "Value color", value: { value: "#444444" } });
    bubbleValueColor = new formattingSettings.ColorPicker({ name: "bubbleValueColor", displayName: "Bubble value color", value: { value: "#e6550d" } });
    valueSource = new formattingSettings.ItemDropdown({
      name: "valueSource",
      displayName: "Value source",
      items: [
        { value: "choropleth", displayName: "Choropleth value" },
        { value: "bubble", displayName: "Bubble value" },
        { value: "both", displayName: "Both (different colors)" }
      ],
      value: { value: "choropleth", displayName: "Choropleth value" }
    });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Bold", value: defaults.bold ?? false });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Italic", value: false });
    haloColor = new formattingSettings.ColorPicker({ name: "haloColor", displayName: "Halo color", value: { value: "#ffffff" } });
    haloWidth = new formattingSettings.NumUpDown({ name: "haloWidth", displayName: "Halo width", value: 2 });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimals", value: 0 });
    format = new formattingSettings.ItemDropdown({
      name: "format",
      displayName: "Number format",
      items: [
        { value: "auto", displayName: "Auto" },
        { value: "thousands", displayName: "Thousands (K)" },
        { value: "millions", displayName: "Millions (M)" },
        { value: "percent", displayName: "Percent" }
      ],
      value: { value: "auto", displayName: "Auto" }
    });
    placement = new formattingSettings.ItemDropdown({
      name: "placement",
      displayName: "Placement",
      items: [
        { value: "horizontal", displayName: "Horizontal" },
        { value: "straight", displayName: "Straight" },
        { value: "curved", displayName: "Curved" },
        { value: "boundary", displayName: "Boundary" }
      ],
      value: { value: "horizontal", displayName: "Horizontal" }
    });
    wordsOnSeparateLines = new formattingSettings.ToggleSwitch({ name: "wordsOnSeparateLines", displayName: "Words on separate lines", value: false });
    stackWhenNeeded = new formattingSettings.ToggleSwitch({ name: "stackWhenNeeded", displayName: "Stack when needed", value: true });
    reduceFontSize = new formattingSettings.ToggleSwitch({ name: "reduceFontSize", displayName: "Reduce font size to fit", value: true });
    allowOverrun = new formattingSettings.ToggleSwitch({ name: "allowOverrun", displayName: "Allow overrun", value: false });
    abbreviate = new formattingSettings.ToggleSwitch({ name: "abbreviate", displayName: "Abbreviate / truncate", value: true });
    spreadCharacters = new formattingSettings.ToggleSwitch({ name: "spreadCharacters", displayName: "Spread characters", value: false });
    avoidHoles = new formattingSettings.ToggleSwitch({ name: "avoidHoles", displayName: "Avoid holes", value: true });
    labelLargestPart = new formattingSettings.ToggleSwitch({ name: "labelLargestPart", displayName: "Label largest polygon part", value: true });
    allowCallout = new formattingSettings.ToggleSwitch({ name: "allowCallout", displayName: "Allow callout if outside", value: true });

    name = cardName;
    displayName = cardDisplayName;
    slices = [this.show, this.content, this.valueSource, this.fontFamily, this.fontSize, this.color, this.valueColor, this.bubbleValueColor, this.bold, this.italic, this.haloColor, this.haloWidth, this.decimals, this.format, this.placement, this.wordsOnSeparateLines, this.stackWhenNeeded, this.reduceFontSize, this.allowOverrun, this.abbreviate, this.spreadCharacters, this.avoidHoles, this.labelLargestPart, this.allowCallout];
  };
}

const StateLabelsCard = makeLabelCard("stateLabels", "Admin1 labels", { show: true, content: "name", fontSize: 12, bold: true });
const LocalityLabelsCard = makeLabelCard("localityLabels", "Admin2 labels (default view)", { show: true, content: "name", fontSize: 9 });
const DrillLocalityLabelsCard = makeLabelCard("drillLocalityLabels", "Admin2 labels (drill view)", { show: true, content: "name", fontSize: 10 });

class BubblesSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: false });
  fillColor = new formattingSettings.ColorPicker({ name: "fillColor", displayName: "Fill color", value: { value: "#e6550d" } });
  strokeColor = new formattingSettings.ColorPicker({ name: "strokeColor", displayName: "Stroke color", value: { value: "#ffffff" } });
  strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Stroke width", value: 1 });
  opacity = new formattingSettings.NumUpDown({ name: "opacity", displayName: "Opacity", value: 0.85 });
  minRadius = new formattingSettings.NumUpDown({ name: "minRadius", displayName: "Min radius (px)", value: 4 });
  maxRadius = new formattingSettings.NumUpDown({ name: "maxRadius", displayName: "Max radius (px)", value: 30 });
  labelPlacement = new formattingSettings.ItemDropdown({
    name: "labelPlacement",
    displayName: "Label position vs bubble",
    items: [
      { value: "above", displayName: "Above bubble" },
      { value: "below", displayName: "Below bubble" },
      { value: "left", displayName: "Left of bubble" },
      { value: "right", displayName: "Right of bubble" },
      { value: "center", displayName: "Center of bubble" }
    ],
    value: { value: "above", displayName: "Above bubble" }
  });

  name = "bubbles";
  displayName = "Bubbles";
  slices = [this.show, this.fillColor, this.strokeColor, this.strokeWidth, this.opacity, this.minRadius, this.maxRadius, this.labelPlacement];
}

class GlyphChartSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: false });
  type = new formattingSettings.ItemDropdown({
    name: "type",
    displayName: "Chart type",
    items: [
      { value: "pie", displayName: "Pie" },
      { value: "donut", displayName: "Donut" },
      { value: "column", displayName: "Column" }
    ],
    value: { value: "pie", displayName: "Pie" }
  });
  minSize = new formattingSettings.NumUpDown({ name: "minSize", displayName: "Min size (px)", value: 14 });
  maxSize = new formattingSettings.NumUpDown({ name: "maxSize", displayName: "Max size (px)", value: 36 });
  scaleByTotal = new formattingSettings.ToggleSwitch({ name: "scaleByTotal", displayName: "Scale glyph by total", value: true });
  stroke = new formattingSettings.ColorPicker({ name: "stroke", displayName: "Stroke color", value: { value: "#ffffff" } });
  strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Stroke width", value: 1 });
  opacity = new formattingSettings.NumUpDown({ name: "opacity", displayName: "Opacity", value: 0.9 });
  donutInnerRatio = new formattingSettings.NumUpDown({ name: "donutInnerRatio", displayName: "Donut inner ratio", value: 0.5 });
  color1 = new formattingSettings.ColorPicker({ name: "color1", displayName: "Category 1", value: { value: "#1f77b4" } });
  color2 = new formattingSettings.ColorPicker({ name: "color2", displayName: "Category 2", value: { value: "#ff7f0e" } });
  color3 = new formattingSettings.ColorPicker({ name: "color3", displayName: "Category 3", value: { value: "#2ca02c" } });
  color4 = new formattingSettings.ColorPicker({ name: "color4", displayName: "Category 4", value: { value: "#d62728" } });
  color5 = new formattingSettings.ColorPicker({ name: "color5", displayName: "Category 5", value: { value: "#9467bd" } });
  color6 = new formattingSettings.ColorPicker({ name: "color6", displayName: "Category 6", value: { value: "#8c564b" } });
  color7 = new formattingSettings.ColorPicker({ name: "color7", displayName: "Category 7", value: { value: "#e377c2" } });
  color8 = new formattingSettings.ColorPicker({ name: "color8", displayName: "Category 8", value: { value: "#7f7f7f" } });

  name = "glyphChart";
  displayName = "Glyph chart";
  slices = [this.show, this.type, this.minSize, this.maxSize, this.scaleByTotal, this.stroke, this.strokeWidth, this.opacity, this.donutInnerRatio, this.color1, this.color2, this.color3, this.color4, this.color5, this.color6, this.color7, this.color8];
}

class ValueLegendSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: true });
  title = new formattingSettings.TextInput({ name: "title", displayName: "Title", placeholder: "(measure name)", value: "" });
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "vertical", displayName: "Vertical" },
      { value: "horizontal", displayName: "Horizontal" }
    ],
    value: { value: "vertical", displayName: "Vertical" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "bottomRight", displayName: "Bottom right" }
  });
  size = new formattingSettings.ItemDropdown({
    name: "size",
    displayName: "Size",
    items: [
      { value: "small", displayName: "Small" },
      { value: "medium", displayName: "Medium" },
      { value: "large", displayName: "Large" }
    ],
    value: { value: "medium", displayName: "Medium" }
  });
  decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimals", value: 0 });

  name = "valueLegend";
  displayName = "Value legend";
  slices = [this.show, this.title, this.orientation, this.position, this.size, this.decimals];
}

class BubbleLegendSettings extends FormattingSettingsCard {
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show", value: true });
  title = new formattingSettings.TextInput({ name: "title", displayName: "Title", placeholder: "(measure name)", value: "" });
  orientation = new formattingSettings.ItemDropdown({
    name: "orientation",
    displayName: "Orientation",
    items: [
      { value: "vertical", displayName: "Vertical" },
      { value: "horizontal", displayName: "Horizontal (3-4 bubbles)" },
      { value: "compact", displayName: "Compact (min / max)" }
    ],
    value: { value: "vertical", displayName: "Vertical" }
  });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topLeft", displayName: "Top left" },
      { value: "topRight", displayName: "Top right" },
      { value: "bottomLeft", displayName: "Bottom left" },
      { value: "bottomRight", displayName: "Bottom right" }
    ],
    value: { value: "bottomLeft", displayName: "Bottom left" }
  });
  size = new formattingSettings.ItemDropdown({
    name: "size",
    displayName: "Size",
    items: [
      { value: "small", displayName: "Small" },
      { value: "medium", displayName: "Medium" },
      { value: "large", displayName: "Large" }
    ],
    value: { value: "medium", displayName: "Medium" }
  });

  name = "bubbleLegend";
  displayName = "Bubble legend";
  slices = [this.show, this.title, this.orientation, this.position, this.size];
}

class ControlsSettings extends FormattingSettingsCard {
  showZoom = new formattingSettings.ToggleSwitch({ name: "showZoom", displayName: "Show zoom buttons", value: true });
  showCopy = new formattingSettings.ToggleSwitch({ name: "showCopy", displayName: "Show copy-to-clipboard button", value: false });
  position = new formattingSettings.ItemDropdown({
    name: "position",
    displayName: "Position",
    items: [
      { value: "topRight", displayName: "Top right" },
      { value: "topLeft", displayName: "Top left" },
      { value: "bottomRight", displayName: "Bottom right" },
      { value: "bottomLeft", displayName: "Bottom left" }
    ],
    value: { value: "topRight", displayName: "Top right" }
  });

  name = "controls";
  displayName = "Controls";
  slices = [this.showZoom, this.showCopy, this.position];
}

class LegendContainerSettings extends FormattingSettingsCard {
  borderWidth = new formattingSettings.NumUpDown({ name: "borderWidth", displayName: "Border width", value: 1 });
  borderColor = new formattingSettings.ColorPicker({ name: "borderColor", displayName: "Border color", value: { value: "#cccccc" } });
  cornerRadius = new formattingSettings.NumUpDown({ name: "cornerRadius", displayName: "Corner radius", value: 6 });
  padding = new formattingSettings.NumUpDown({ name: "padding", displayName: "Padding", value: 8 });
  background = new formattingSettings.ColorPicker({ name: "background", displayName: "Background color", value: { value: "#ffffff" } });
  backgroundOpacity = new formattingSettings.NumUpDown({ name: "backgroundOpacity", displayName: "Background opacity", value: 0.9 });

  name = "legendContainer";
  displayName = "Legend container";
  slices = [this.borderWidth, this.borderColor, this.cornerRadius, this.padding, this.background, this.backgroundOpacity];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  general = new GeneralSettings();
  choropleth = new ChoroplethSettings();
  borders = new BordersSettings();
  stateLabels = new StateLabelsCard();
  localityLabels = new LocalityLabelsCard();
  drillLocalityLabels = new DrillLocalityLabelsCard();
  bubbles = new BubblesSettings();
  glyphChart = new GlyphChartSettings();
  valueLegend = new ValueLegendSettings();
  bubbleLegend = new BubbleLegendSettings();
  controls = new ControlsSettings();
  legendContainer = new LegendContainerSettings();

  // Order matters: this is the order users see in the Power BI format pane.
  // Group from "what you see first" outward — map setup, then how the map is
  // colored, then bubbles (a layer that sits above the choropleth), then
  // borders, labels, and finally legends.
  cards = [
    this.general,
    this.choropleth,
    this.bubbles,
    this.glyphChart,
    this.borders,
    this.stateLabels,
    this.localityLabels,
    this.drillLocalityLabels,
    this.valueLegend,
    this.bubbleLegend,
    this.legendContainer,
    this.controls
  ];
}
