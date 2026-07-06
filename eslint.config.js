// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  // src/engine/ 层禁止导入 stock-sdk 主包（纯计算层不允许调用含网络请求的命名空间 API）
  // 允许导入纯计算 subpath（stock-sdk/indicators、stock-sdk/signals、stock-sdk/screener）
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: 'stock-sdk',
          message:
            'src/engine/ 层不允许直接导入 stock-sdk 主包（含网络调用），请使用 stock-sdk/indicators、stock-sdk/signals 或 stock-sdk/screener 子路径导入纯计算函数',
        },
      ],
    },
  },
  // 允许 test 文件使用 any 和未使用变量
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
