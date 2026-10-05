import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// waitFor/findBy esperam até 5 s (o padrão é 1 s): em máquina lenta a tela leva mais que 1 s para ficar pronta. Só espera mais se precisar.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
