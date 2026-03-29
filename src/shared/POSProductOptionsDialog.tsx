import React, { Fragment } from 'react';
import { AnimatePresence } from 'motion/react';
import { buildDeliveryCardapioTheme } from '../segments/delivery/deliveryCardapioTheme';
import { CardapioThemeShell } from '../segments/delivery/DeliveryCardapioThemeContext';
import {
  ProductOptionsModal,
  type ProductOptionsCartItem,
  type ProductOptionsProduto,
} from './ProductOptionsModal';

type POSProductOptionsDialogProps = {
  produto: ProductOptionsProduto;
  onClose: () => void;
  onAdicionar: (item: ProductOptionsCartItem) => void;
};

const posProductOptionsTheme = buildDeliveryCardapioTheme('dark_premium');

export default function POSProductOptionsDialog({
  produto,
  onClose,
  onAdicionar,
}: POSProductOptionsDialogProps) {
  return (
    <CardapioThemeShell theme={posProductOptionsTheme}>
      <AnimatePresence>
        <Fragment key={produto.id}>
          <ProductOptionsModal
            produto={produto}
            addDestination="pedido"
            visualVariant="pos"
            onClose={onClose}
            onAdicionar={onAdicionar}
          />
        </Fragment>
      </AnimatePresence>
    </CardapioThemeShell>
  );
}
