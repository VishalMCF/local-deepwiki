import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRepoDto {
  /** Absolute path to a local checkout, e.g. /Users/me/code/minikeyvalue */
  @IsString()
  @MinLength(1)
  path!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  presetKey?: string;
}

export class RefreshRepoDto {
  @IsOptional()
  @IsString()
  presetKey?: string;

  @IsOptional()
  @IsIn(['full', 'refresh'])
  mode?: 'full' | 'refresh';
}
