import { TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getTracker } from '../features/tracker/application/runtime';
import { BalanceWidget, PaymentsDueWidget, QuickAddWidget } from './owllowance-widgets';
import { balanceText, dueRows } from './widget-data';

// Runs in the background when Android adds, resizes or periodically refreshes a widget.
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  if (widgetInfo.widgetName === 'QuickAdd') { renderWidget(QuickAddWidget()); return; }
  try {
    const overview = await (await getTracker()).repository.overview();
    if (widgetInfo.widgetName === 'Balance') renderWidget(BalanceWidget({ amount: balanceText(overview) }));
    else renderWidget(PaymentsDueWidget(dueRows(overview, widgetInfo.height)));
  } catch {
    renderWidget(<TextWidget text="Open Owllowance to load" style={{ fontSize: 13, color: '#566273' }} />);
  }
}
