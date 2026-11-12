import { Navigate } from 'react-router-dom';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import type { FeatureToggleKey } from '../data/featureTogglesApi';

type FeatureId = FeatureToggleKey;

export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureId;
  children: React.ReactNode;
}) {
  const { toggles } = useFeatureToggles();
  if (!toggles[feature]) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
