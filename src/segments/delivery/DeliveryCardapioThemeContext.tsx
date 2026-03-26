import React, { createContext, useContext } from 'react';
import { buildDeliveryCardapioTheme, type DeliveryCardapioTheme } from './deliveryCardapioTheme';

const DeliveryCardapioThemeContext = createContext<DeliveryCardapioTheme>(buildDeliveryCardapioTheme('dark_premium'));

export function useDeliveryCardapioTheme() {
  return useContext(DeliveryCardapioThemeContext);
}

export function CardapioThemeShell({ theme, children }: { theme: DeliveryCardapioTheme; children: React.ReactNode }) {
  return <DeliveryCardapioThemeContext.Provider value={theme}>{children}</DeliveryCardapioThemeContext.Provider>;
}
