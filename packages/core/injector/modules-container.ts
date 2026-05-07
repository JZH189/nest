import { Observable, ReplaySubject } from 'rxjs';
import { uid } from 'uid';
import { Module } from './module';

export class ModulesContainer extends Map<string, Module> {
  private readonly _applicationId = uid(21);
  private readonly _rpcTargetRegistry$ = new ReplaySubject<any>();

  /**
   * 应用程序实例的唯一标识符。
   */
  get applicationId(): string {
    return this._applicationId;
  }

  /**
   * 根据标识符获取模块。
   * @param id 要检索的模块标识符。
   * @returns 如果找到则返回模块实例，否则返回 undefined。
   */
  public getById(id: string): Module | undefined {
    return Array.from(this.values()).find(moduleRef => moduleRef.id === id);
  }

  /**
   * 将 RPC 目标注册表作为可观察对象返回。
   * 此注册表包含应用程序中注册的所有 RPC 目标。
   * @returns 一个发出 RPC 目标注册表的可观察对象。
   */
  public getRpcTargetRegistry<T>(): Observable<T> {
    return this._rpcTargetRegistry$.asObservable();
  }

  /**
   * 向注册表添加一个 RPC 目标。
   * @param target 要添加的 RPC 目标。
   */
  public addRpcTarget<T>(target: T): void {
    this._rpcTargetRegistry$.next(target);
  }
}
