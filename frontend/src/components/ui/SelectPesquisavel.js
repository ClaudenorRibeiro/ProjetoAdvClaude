import React from 'react';
import Select from 'react-select';

// Controle único para cadastros que podem crescer. Mantém o valor simples que
// os formulários já enviam à API, mas acrescenta filtragem por texto.
export default function SelectPesquisavel({
  opcoes = [],
  value = '',
  onChange,
  placeholder = '— Selecione —',
  ariaLabel,
  disabled = false,
  isClearable = false,
  className,
  style,
}) {
  const opcoesNormalizadas = opcoes.map(opcao => ({
    value: String(opcao.value),
    label: opcao.label,
    disabled: Boolean(opcao.disabled),
  }));
  const selecionada = opcoesNormalizadas.find(opcao => opcao.value === String(value ?? '')) || null;

  return (
    <Select
      aria-label={ariaLabel}
      className={className}
      classNamePrefix="select-pesquisavel"
      isDisabled={disabled}
      isClearable={isClearable}
      isSearchable
      noOptionsMessage={() => 'Nenhuma opção encontrada'}
      options={opcoesNormalizadas}
      placeholder={placeholder}
      value={selecionada}
      onChange={opcao => onChange(opcao ? opcao.value : '')}
      styles={{
        control: (base, state) => ({ ...base, minHeight: '38px', borderColor: state.isFocused ? '#2563eb' : '#d1d5db', boxShadow: state.isFocused ? '0 0 0 2px rgba(37, 99, 235, .15)' : 'none', '&:hover': { borderColor: '#2563eb' } }),
        menu: base => ({ ...base, zIndex: 10000 }),
        ...style,
      }}
    />
  );
}
