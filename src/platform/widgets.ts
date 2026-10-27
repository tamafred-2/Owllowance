import { requestWidgetUpdate } from 'react-native-android-widget';
import type { Overview } from '../domain/ledger';
import { BalanceWidget, PaymentsDueWidget } from '../widgets/owllowance-widgets';
import { balanceText, dueRows } from '../widgets/widget-data';

// Pushes fresh content to any widgets on the home screen after data changes.
export async function updateWidgets(overview: Overview): Promise<void> {
  await requestWidgetUpdate({ widgetName: 'PaymentsDue', renderWidget: info => PaymentsDueWidget(dueRows(overview, info.height)) });
  await requestWidgetUpdate({ widgetName: 'Balance', renderWidget: () => BalanceWidget({ amount: balanceText(overview) }) });
}
