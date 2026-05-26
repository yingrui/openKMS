import { Navigate } from 'react-router-dom';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';

type FeatureId = 'evaluations' | 'connectors';

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
